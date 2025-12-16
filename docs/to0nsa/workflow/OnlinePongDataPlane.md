# Online Pong Data Plane – Frames, Ticks, and Latency

This document explains the **data plane** of online Pong – what happens on the WebSocket between the browser and game server once a match is handed off:

- How the server runs the authoritative simulation (ticks).
- How `FRAME` packets are produced and consumed.
- How start times, ticks, and random seeds are aligned across client and server.
- How latency is measured and handled (ping/PONG, smoothing, grace windows).

For control‑plane flows (queue → handoff → gateway → result), read:

- `OnlinePongNetwork.md`
- `MatchmakingService.md`
- `GatewayAndWebSockets.md`
- `GameNode.md`

---

## 1. Big picture: simulation vs frames vs latency

At a high level:

- The **game server** runs a deterministic Pong simulation at a fixed tick rate (`tickHz`, default 60 Hz).
- Every tick, it:
  - Reads current input (paddle axes) from both players.
  - Advances the simulation (`stepOnce`).
  - Produces:
    - New game state.
    - Events (goals, serves, phase changes).
    - A match snapshot (scores, games history).
  - Increments the simulation tick counter.
  - Broadcasts a `FRAME` message to both players.
- The **client**:
  - Receives `FRAME` messages and feeds them into the render engine (`@pong/render`).
  - Sends input updates (`axis`) only when the paddle axis changes.
  - Periodically sends `ping` messages; the server responds with `PONG` so the client can measure RTT and track latency.

Everything else (ROOM_STATE, START, RESUME_TOKEN, MATCH_END) is support for starting, reconnecting, and ending the simulation cleanly.

---

## 2. Server tick loop and frame generation

### 2.1 Tick configuration and start scheduling

**Files:**

- `apps/game-server/src/app/Config.ts`
- `apps/game-server/src/app/MatchRunner.ts`
- `apps/game-server/src/app/Broadcaster.ts`

Config (`Config.ts`):

- `tickHz` – simulation tick rate (default 60 Hz, configurable via `GAME_SERVER_TICK_HZ`).
- `minStartDelayMs` – minimum delay between both players joining and simulation start (default 1500 ms).
- `lagCompensationMs` – server‑side lag compensation window for physics (default 30 ms).

Scheduling start (`MatchRunner.scheduleStart`):

```ts
const now = this.clock.now();
const target = Math.max(session.reservation.simulationStartTick, now + this.config.minStartDelayMs);
session.reservation.simulationStartTick = target;
session.model.startAtEpochMs = target;

this.broadcaster.broadcastRoomState(session, 'READY');
this.broadcaster.broadcastStart(session, target);

session.model.setStartTimeout(
  this.scheduler.setTimeout(() => this.startMatch(session), Math.max(0, target - now)),
);
```

Key ideas:

- `simulationStartTick` / `startAtEpochMs` are **wall‑clock timestamps** (epoch milliseconds) when the simulation should begin.
- The server may adjust the start time upwards to ensure a minimum buffer (`minStartDelayMs`) so both clients can connect and prepare.
- Before the simulation starts, the server sends:
  - `ROOM_STATE` (state `'READY'`, including `startAtEpochMs`, `randomSeed`, `tickRateHz`).
  - `START` with the final `startAtEpochMs`, `randomSeed`, and `tickRateHz`.

### 2.2 Running the tick loop

Starting match (`MatchRunner.startMatch`):

```ts
session.model.markStart(session.model.startAtEpochMs ?? this.clock.now());
// Initialize ball/paddles and pause state...

this.broadcaster.broadcastRoomState(session, 'PLAYING');

const intervalMs = 1000 / this.config.tickHz;
session.model.setLoopCancel(this.scheduler.setInterval(() => this.tick(session), intervalMs));
```

Tick function (`MatchRunner.tick`):

```ts
const dt = 1 / this.config.tickHz;
const intent = this.resolveIntent(session); // left/right axes based on current player inputs
const result = stepOnce({
  controller: model.controller,
  dt,
  intent,
  state: model.state,
  tickHz: this.config.tickHz,
  lagCompensationSec: this.config.lagCompensationMs / 1000,
});

model.applyStep(result);
model.tick += 1;

this.broadcaster.broadcastFrame(session);
```

`stepOnce` (`TickEngine.ts`):

- Applies player intents to paddles.
- Advances the physics and game logic with `handleSteps` from `@pong/game-logic`.
- Applies lag compensation in collisions using `lagCompensationSec`.
- Normalizes pause durations to exact multiples of ticks (`quantizeMs`).
- Produces:
  - Updated `GameState`.
  - Server events (`ServerEvents`).
  - A `MatchSnapshot` (scores, games history, etc.).

### 2.3 Broadcasting frames

`Broadcaster.broadcastFrame`:

```ts
const p1 = session.players.get('P1');
const p2 = session.players.get('P2');

forEachSeat(session, (_seat, player) => {
  const axis = player.seat === 'P1' ? (p2?.axis ?? 0) : (p1?.axis ?? 0);
  const payload = {
    type: 'FRAME',
    state: model.state,
    events: model.lastEvents,
    match: model.lastSnapshot,
    tick: model.tick,
    axis,
  };
  safeSend(player.socket, payload, this.logger);
});
```

Per frame:

- `state` – authoritative `GameState` for this tick.
- `events` – combined events from physics and controller (goals, serves, etc.).
- `match` – `MatchSnapshot` with scores and games history.
- `tick` – simulation tick index (monotonically increasing).
- `axis` – opponent’s input axis from the **recipient’s** point of view.

The client’s online host (`connect-online.ts` + `@pong/render`) uses these to drive rendering and any local prediction/smoothing logic.

---

## 3. Client consumption of frames and start messages

**File:** `apps/frontend/src/games/pong/modes/online/connect-online.ts`

When the WS opens:

- The client sets up:
  - `snapshotListeners` – consumers of `FRAME` data.
  - `roomStateListeners` – consumers of `ROOM_STATE`.
  - `startListeners` + `awaitStart()` – a way to await the `START` signal before starting the local simulation.
  - `opponentDisconnectedListeners`, `opponentReconnectedListeners`, `matchEndListeners`.
  - Latency measurement (`ping`/`PONG`).

### 3.1 Handling `FRAME`

On `FRAME` messages:

```ts
const fanOutFrame = ({ state, events, match, axis }) => {
  if (!state) return;
  snapshotListeners.forEach((cb) => cb(state, events ?? {}, match));
  if (typeof axis === 'number') {
    opponentAxisListeners.forEach((cb) => cb(axis));
  }
};

// ...
case 'FRAME':
  fanOutFrame(data);
  break;
```

- The online host wires `onSnapshot` and `onOpponentAxis` to:
  - Update render state (positions, scores, etc.).
  - Display the opponent’s movement as seen by the local player.

### 3.2 Handling `ROOM_STATE` and `START`

The client derives a `StartSignal` either from a `START` message or, if reconnecting, from a `ROOM_STATE` snapshot:

```ts
case 'ROOM_STATE':
  roomStateListeners.forEach((cb) => cb(data as RoomStateMessage));
  // If we rejoined mid-match, synthesize a START from ROOM_STATE
  if (!startPayload && (rs.state === 'READY' || rs.state === 'PLAYING')) {
    const payload: StartSignal = {
      startAtEpochMs: rs.startAtEpochMs ?? Date.now(),
      randomSeed: rs.randomSeed ?? cfg.randomSeed,
      tickRateHz: rs.tickRateHz ?? CLIENT_TICK_RATE_HZ,
    };
    notifyStart(payload);
  }
  break;

case 'START':
  const startMsg = data as StartMessage;
  const payload: StartSignal = {
    startAtEpochMs: startMsg.startAtEpochMs ?? Date.now(),
    randomSeed: startMsg.randomSeed ?? cfg.randomSeed,
    tickRateHz: startMsg.tickRateHz ?? CLIENT_TICK_RATE_HZ,
    players: startMsg.players,
  };
  notifyStart(payload);
  break;
```

`awaitStart()` returns a promise that resolves with this `StartSignal`. The render layer uses:

- `startAtEpochMs` – shared wall‑clock start time.
- `randomSeed` – to seed any client‑side deterministic components.
- `tickRateHz` – to align client simulation/render cadence with the server.

Relationship to tokens:

- `simulationStartTick` / `startAtEpochMs` is also included in join tokens and handoff payloads so both matchmaking and clients know when the simulation will start.
- In practice, the actual start time is effectively `startAtEpochMs` broadcast by `START`/`ROOM_STATE`, which may be adjusted from the original token value to account for buffer/latency.

The client may start rendering slightly **before** or **after** the exact server epoch depending on latency and buffering strategy in the render code, but `startAtEpochMs` provides the synchronization anchor.

---

## 4. Input path and lag compensation

### 4.1 Client input (`axis`, `forfeit`)

`connect-online.ts` exposes:

- `sendLocalAxis(axis: number)`:

  ```ts
  sendLocalAxis(axis: number) {
    if (axis === lastSentAxis) return;
    lastSentAxis = axis;
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'axis', axis }));
  }
  ```

  - Sends an `axis` message only when the axis changes, reducing bandwidth.
  - Server uses the latest axis per tick for simulation.

- `forfeit()`:

  ```ts
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'forfeit' }));
  clearResumeForRoom(roomIdentifier);
  ```

  - Explicitly ends the match early; server will treat it as a forfeit and send `MATCH_END`.

### 4.2 Server input handling and lag compensation

On the server (`WSServer.handleMessage`):

- On `axis`:
  - Updates the player’s `axis` value stored in the session.
  - `MatchRunner.resolveIntent` reads `session.players.get('P1').axis` and `P2.axis` mapped into left/right roles based on who is east/west at each end of the table.

Lag compensation (`TickEngine.ts`):

```ts
const result = stepOnce({
  state,
  intent,
  dt,
  tickHz,
  controller,
  lagCompensationSec: cfg.lagCompensationMs / 1000,
});
```

Inside `stepOnce`:

- Physics and game logic are advanced via `handleSteps`, which takes `lagCompensationSec`.
- That window allows the server to treat some collisions (e.g., ball hitting a paddle shortly after a tick) as if they happened at the end of the current tick rather than the next one.
- This gives a small server‑side **forgiveness window** for paddle hits under latency, making the game feel fairer for players with higher RTT.

---

## 5. Latency measurement (`ping`/`PONG`)

The client periodically measures RTT using `ping` and `PONG`.

In `connect-online.ts`:

```ts
const startPingLoop = (socket: WebSocket) => {
  const sendPing = () => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'ping', clientSentAt: nowMs() }));
    }
  };
  sendPing();
  pingInterval = window.setInterval(sendPing, 2000);
};
```

On server (`WSServer.handleMessage`):

- On `ping`, the server responds with a `PONG` message:

```ts
const message = {
  type: 'PONG',
  clientSentAt: payload.clientSentAt,
  serverReceivedAt: performance.now(),
  serverSentAt: performance.now(),
};
socket.send(JSON.stringify(message));
```

On client:

```ts
case 'PONG': {
  const now = nowMs();
  const sentAt = typeof data.clientSentAt === 'number' ? data.clientSentAt : now;
  const rtt = Math.max(0, now - sentAt);
  const nextLatency = smoothedLatencyMs * 0.7 + rtt * 0.3;
  notifyLatency({ rttMs: rtt, avgMs: nextLatency });
  break;
}
```

- `smoothedLatencyMs` is an exponential moving average:
  - 70% previous average, 30% new sample.
- Consumers of `onLatencyMeasured` get both the current RTT sample and the smoothed average.

This latency measurement is used to:

- Display latency indicators in the UI (when implemented).
- Inform buffering/scheduling in the render layer (e.g., how far behind the live tick the client stays).

---

## 6. Reconnect grace windows (data‑plane angle)

While reconnect/resume is covered more deeply in `GameNode.md` and `SecurityAndTokens.md`, the data‑plane aspects are:

- Reconnect grace windows (`Policies.ts` + `Config.ts`):

  ```ts
  reconnectGraceMs(isTournament, cfg);
  // cfg.reconnectGraceMs.casualMs (default 5000)
  // cfg.reconnectGraceMs.tournamentMs (default 10000)
  ```

- When a player disconnects:
  - Game server marks them as disconnected.
  - Sends `OPPONENT_DISCONNECTED` to the remaining player with `gracePeriodMs`.
  - If the player reconnects within this window (using a resume token), it sends `OPPONENT_RECONNECTED` and resumes the loop.
  - If they don’t, the server ends the match with a timeout/forfeit and sends `MATCH_END`.

From the wire‑level point of view, reconnect behavior is:

- Resume tokens (`RESUME_TOKEN` messages) are rotated periodically and stored in Redis.
- Client uses the latest token to reconnect via `Sec-WebSocket-Protocol: resume,<token>`.
- On success, server resumes the tick loop and continues sending `FRAME` messages; from the remaining player’s view this is announced via `OPPONENT_RECONNECTED`.

---

## 7. Summary

Data‑plane responsibilities are split roughly as follows:

- **Game server:**
  - Runs the authoritative simulation at `tickHz`.
  - Applies lag compensation using `lagCompensationMs`.
  - Produces `FRAME` messages with state, events, match snapshots, and tick indices.
  - Announces room state and start time (`ROOM_STATE`, `START`).
  - Manages reconnect grace windows and sends `OPPONENT_*` / `RESUME_TOKEN` / `MATCH_END`.

- **Client:**
  - Sends input deltas (`axis`) and `forfeit` when quitting.
  - Uses `FRAME` messages to drive rendering and match HUD.
  - Uses `ROOM_STATE`/`START` to synchronize the local simulation start and tick cadence.
  - Measures latency with `ping`/`PONG` and smooths RTT estimates.
  - Uses resume tokens and reconnect logic to survive temporary disconnects.

Understanding these details helps when:

- Debugging desyncs between client and server.
- Tuning tick rate, lag compensation, and reconnect grace windows.
- Extending the protocol (e.g., adding new events to `FRAME`, or new latency diagnostics).
