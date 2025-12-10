# Game Node – Server‑Authoritative Pong Simulation

This document is a **course on the Game Node**, the service that actually runs Pong matches on the server.

It explains:

- What the Game Node is responsible for.
- How it receives rooms from the allocator/matchmaking.
- How it handles WebSocket connections from the gateway.
- How it runs a deterministic simulation using `@pong/game-logic`.
- How it handles disconnects, resumes, and match results.

Relevant code:

- `apps/game-server/src/app/*`
- `apps/game-server/src/infra/ws/WSServer.ts`
- `apps/game-server/src/infra/http/index.ts`
- `packages/pong/game-logic/*`
- Message shapes in `packages/pong/shared/src/protocol/net.ts`

Read this after:

- `OnlinePongNetwork.md` – client‑centric online flow.
- `MatchmakingService.md` – how rooms and tokens are created.
- `GatewayAndWebSockets.md` – how `/g/:roomId` connections are routed.
- `SecurityAndTokens.md` – how join/resume tokens are issued and validated.
- `ResultsAndRanking.md` – how this node’s results are persisted and turned into rankings.
- `OnlinePongDataPlane.md` – tick loop, FRAME messages, latency, and reconnect grace from a data‑plane perspective.
- `OnlinePongReconnect.md` – detailed reconnect/resume behavior and grace‑window UX.

For implementation details:

- `docs/to0nsa/node/RealtimeServers.md` – Fastify/WebSocket infrastructure in the game server.
- `docs/to0nsa/redis/GameServerAndGateway.md` – Redis usage for join/resume tokens, routing, and rate limiting.

---

## 1. Role of the Game Node

In the overall architecture (see `docs/dev/matchmaking/blueprint.md`), the **Game Node**:

- Hosts many **rooms** (matches) at once.
- Runs the **server‑authoritative, deterministic simulation** for each match.
- Receives **player input** via WebSockets (through the gateway).
- Broadcasts **frame snapshots and events** to clients.
- Handles **disconnects and resumes** with a grace window.
- Produces an **authoritative match result** that is reported back to the backend.

The Game Node **does not**:

- Perform matchmaking.
- Validate user accounts (that happens earlier).
- Serve the website or React app.

You can think of it as a specialized, headless “Pong engine” with networking around it.

---

## 2. High‑level structure (`GameServer`)

Entry: `apps/game-server/src/app/GameServer.ts`.

`GameServer` wires together:

- Configuration (`Config.ts`)
- Time and scheduling (`Time.ts`)
- Redis factory (`RedisFactory.ts`)
- Room registry (`RoomRegistry.ts`)
- Broadcaster (`Broadcaster.ts`)
- Result reporter (`ResultReporter.ts`)
- Match runner (`MatchRunner.ts`)
- Resume token service (`ResumeTokenService.ts`)
- Reconnect manager (`ReconnectManager.ts`)
- HTTP admin server (`infra/http/index.ts`)
- WebSocket server (`infra/ws/WSServer.ts`)

Key constructor snippet:

```ts
export class GameServer {
  private config: AppConfig;
  private clock: Clock;
  private scheduler: Scheduler;
  private logger: FastifyBaseLogger;
  private redis: Redis;
  private registry: RoomRegistry;
  private broadcaster: Broadcaster;
  private reporter: ResultReporter;
  private runner: MatchRunner;
  private reconnects: ReconnectManager;
  private wsServer: WSServer;
  private resumeTokens: ResumeTokenService;

  constructor() {
    this.config = loadConfig();
    this.clock = systemClock();
    this.scheduler = nodeScheduler();
    this.logger = createLogger({ service: 'game-server' });

    const redisFactory = createRedisFactory(this.config.redisUrl);
    this.redis = redisFactory.create();

    this.registry = new RoomRegistry({ logger: this.logger });
    this.broadcaster = new Broadcaster({ config: this.config, logger: this.logger });
    this.reporter = new ResultReporter({
      apiUrl: this.config.apiUrl,
      matchSecret: this.config.matchSecret,
      logger: this.logger,
    });

    const onMatchComplete = (
      session: MatchSession,
      summary: OnlineMatchSummary | null,
      winner?: 'east' | 'west',
    ) => {
      // Log, close sockets, clear session...
    };

    this.runner = new MatchRunner({
      /* tick loop + result handling */
    });
    this.resumeTokens = new ResumeTokenService({ redis: this.redis, logger: this.logger });
    this.reconnects = new ReconnectManager({
      /* grace window handling */
    });

    this.wsServer = new WSServer({
      config: this.config,
      registry: this.registry,
      broadcaster: this.broadcaster,
      runner: this.runner,
      resumeTokens: this.resumeTokens,
      reconnects: this.reconnects,
      redis: this.redis,
      logger: this.logger,
      reporter: this.reporter,
    });

    createHttpServer({
      adminSecret: this.config.adminSecret,
      port: this.config.httpPort,
      registry: this.registry,
      onCreateRoom: async (body) => {
        const { status } = this.registry.registerRoom(body as CreateRoomRequest);
        return status === 'exists' ? { status: 'exists' } : { status: 'room registered' };
      },
    });
  }

  async start(): Promise<void> {
    await this.wsServer.listen();
    this.logger.info({}, '[GameServer] Startup complete');
  }
}
```

Conceptually:

- HTTP admin creates rooms (via allocator).
- `RoomRegistry` tracks reservations and live sessions.
- `WSServer` handles WebSocket connections from the gateway.
- `MatchRunner` runs the physics/logic loop (`TickEngine` + `@pong/game-logic`).
- `ReconnectManager` + `ResumeTokenService` implement reconnect/resume.
- `Broadcaster` emits game messages to clients.
- `ResultReporter` calls backend APIs to store match results.

---

## 3. Room lifecycle: from reservation to session

### 3.1 Room registration (admin HTTP)

The allocator calls Game Node’s HTTP admin endpoint to create a room:

- Controlled by `createHttpServer` in `infra/http/index.ts`:
  - Validates an admin secret.
  - Accepts `CreateRoomRequest`.
  - Calls `RoomRegistry.registerRoom`.

`RoomRegistry.registerRoom` (`apps/game-server/src/app/RoomRegistry.ts`):

```ts
registerRoom(request: CreateRoomRequest): {
  status: 'exists' | 'registered';
  reservation: RoomReservation;
} {
  const existing = this.reservations.get(request.roomIdentifier);
  if (existing) {
    return { status: 'exists', reservation: existing };
  }

  const reservation = createRoomReservation(request);
  this.reservations.set(reservation.roomIdentifier, reservation);
  return { status: 'registered', reservation };
}
```

`RoomReservation` (in `domain/MatchTypes.ts`) holds:

- `roomIdentifier`, `idempotencyKey`
- `capacity`, `joinDeadlineAtEpochMs`
- `randomSeed`, `simulationStartTick`
- `expectedPlayers` map:
  - Includes player identifier, side (`east`/`west`), seat (`P1`/`P2`), MMR, etc.
- `consumedJtis` set for join tokens.
- Tournament info if applicable.

At this stage, **no WebSocket connections exist yet**; the room is reserved and ready for players to join.

### 3.2 Creating a live session

When the first player connects via WebSocket, `RoomRegistry.ensureSession` is called:

```ts
ensureSession(roomIdentifier: string): MatchSession {
  const existing = this.sessions.get(roomIdentifier);
  if (existing) return existing;

  const reservation = this.reservations.get(roomIdentifier);
  if (!reservation) {
    throw new Error(`Room ${roomIdentifier} not registered`);
  }
  const model = MatchModel.create(reservation);
  const session: MatchSession = {
    reservation,
    model,
    players: new Map(),
  };
  this.sessions.set(roomIdentifier, session);
  return session;
}
```

`MatchModel`:

- Holds the current `GameState` (from `@pong/game-logic`).
- Tracks tick number, started/stopped flags, timers for start, disconnect grace, etc.
- Provides methods like `applyStep`, `cancelLoop`, `markStopped`, `startDisconnectGrace`.

At this point, the **simulation is instantiated**, but may not be running yet (depends on both players joining).

---

## 4. Handling WebSocket connections (`WSServer`)

`apps/game-server/src/infra/ws/WSServer.ts` is the WebSocket server the gateway proxies to.

### 4.1 Setup and listen

The constructor:

- Accepts `config`, `registry`, `broadcaster`, `runner`, `resumeTokens`, `reconnects`, `redis`, `reporter`, and an optional `AuthService`.
- Creates an internal Fastify instance with `@fastify/websocket`.
- Uses a `RedisTokenBucket` (`gs:rl`) to rate‑limit game messages per connection.

`listen()`:

```ts
async listen(): Promise<void> {
  await this.init();
  await this.app.listen({
    port: this.config.wsPort,
    host: '0.0.0.0',
  });
  this.logger.info({ port: this.config.wsPort }, '[WSServer] Listening');
}
```

### 4.2 Upgrade and token verification

Although the gateway verifies tokens, the node also uses `AuthService`:

- To **verify join tokens offline** when connections arrive.
- To **consume resume tokens** via `ResumeTokenService`.

`WSServer` parses the `Sec-WebSocket-Protocol` header similar to the gateway:

```ts
private parseProtocols(headers: Record<string, unknown>): string[] {
  const raw = headers['sec-websocket-protocol'];
  if (typeof raw !== 'string') return [];
  return raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}

private extractProtocolToken(protocols: string[], tag: string): string | undefined {
  const idx = protocols.findIndex((p) => p.toLowerCase() === tag);
  return idx === -1 ? undefined : protocols[idx + 1];
}
```

When a connection is established:

- The node:
  - Extracts join/resume token from the protocols.
  - Validates/consumes it (`AuthService`, `ResumeTokenService`).
  - Uses `RoomRegistry` to bind the WebSocket to a `MatchSession` and `Seat`.

If anything is invalid:

- The node closes the connection with an appropriate close code (`CLOSE_CODES` from `@pong/shared/protocol/net`).

### 4.3 Binding a player to a session

`bindPlayerConnection` attaches a WebSocket to a `PlayerConnectionState`:

```ts
private async bindPlayerConnection(
  session: MatchSession,
  seat: 'P1' | 'P2',
  player: PlayerConnectionState,
  connection: WebSocket,
) {
  if (player.socket && player.socket !== connection && player.socket.readyState === player.socket.OPEN) {
    this.logger.warn('[WSServer] Closing player socket');
    player.socket.close(4403, 'replaced-by-resume');
  }
  player.socket = connection;

  const graceMs = reconnectGraceMs(Boolean(session.reservation.tournament), this.config);
  const rotatePeriod = Math.max(3_000, Math.floor(graceMs / 3));
  const rotate = async () => {
    const { resumeToken } = await this.resumeTokens.issue({
      roomIdentifier: session.reservation.roomIdentifier,
      playerIdentifier: player.playerIdentifier,
      sessionIdentifier: session.model.id,
      ttlMs: graceMs + rotatePeriod,
    });
    this.broadcaster.broadcastResumeToken(session, seat, resumeToken);
  };

  this.clearResumeInterval(player);
  try {
    await rotate();
  } catch (err) {
    // log + proceed
  }
  player.resumeInterval = setInterval(() => void rotate(), rotatePeriod);
}
```

Key ideas:

- If an old socket exists, it is closed (useful for resume / reconnect).
- A **resume token rotation timer** is installed:
  - Regularly issues fresh resume tokens via `ResumeTokenService`.
  - Broadcasts them to the client (`broadcastResumeToken`).
  - Tokens have TTL that covers the grace window + overlap, so a player can reconnect after a brief disconnect.

### 4.4 Receiving input and dispatching to MatchRunner

When the client sends input messages (e.g., axis values for paddle movement), `WSServer`:

- Parses them (JSON).
- Validates that the message is allowed (`RedisTokenBucket` for rate limiting).
- Calls `RoomRegistry.updateAxis(roomIdentifier, seat, axis)` to update `PlayerConnectionState.axis`.

The actual simulation loop (in `MatchRunner`) will read these axis values when stepping the game (see next section).

---

## 5. Tick engine and deterministic simulation

The heart of the Game Node is **deterministic stepping** of the game state.

### 5.1 TickEngine and MatchRunner

`TickEngine` (`apps/game-server/src/domain/TickEngine.ts`) defines `stepOnce`:

```ts
import { handleSteps, stepPaddles, type GameState } from '@pong/game-logic';
import type { createMatchController } from '@pong/game-logic';
import type { FrameEvents, MatchSnapshot } from '@pong/shared';
import { quantizeMs } from './PauseQuantizer.ts';

export type MatchController = ReturnType<typeof createMatchController>;
export type Intent = { leftAxis: number; rightAxis: number };

export function stepOnce({
  state,
  intent,
  dt,
  tickHz,
  controller,
  lagCompensationSec,
}: StepOnceArgs): StepResult {
  const withPaddles = stepPaddles(state, intent, dt);
  const prevPhase = withPaddles.phase;
  const stepped = handleSteps(withPaddles, dt, lagCompensationSec ?? 0);
  let nextState = stepped.next;

  // Quantize pause durations for determinism
  if (prevPhase !== 'pauseBtwPoints' && nextState.phase === 'pauseBtwPoints') {
    const ms = Math.max(0, nextState.tPauseBtwPointsMs ?? 0);
    nextState = { ...nextState, tPauseBtwPointsMs: quantizeMs(ms, tickHz) };
  }
  // similar for pauseBetweenGames...

  const controllerResult = controller.afterPhysicsStep(nextState);
  const mergedState = controllerResult.state;
  const events: ServerEvents = { ...stepped.events, ...controllerResult.events };
  const snapshot = controller.getSnapshot();

  return { state: mergedState, events, snapshot };
}
```

`MatchRunner.tick` (`apps/game-server/src/app/MatchRunner.ts`) calls this function at a fixed rate:

```ts
private tick(session: MatchSession): void {
  const { model } = session;
  const dt = 1 / this.config.tickHz;
  const intent = this.resolveIntent(session);
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

  const matchOverEvent = result.events.matchOver as MatchOverEvent;
  if (matchOverEvent && !model.resultSubmitted && !model.resultSubmitting) {
    void this.handleMatchOver(session, matchOverEvent);
  }
}
```

`resolveIntent` reads player inputs from `RoomRegistry`:

```ts
private resolveIntent(session: MatchSession): { leftAxis: number; rightAxis: number } {
  const playerAtEnd = session.model.state.playerAtEnd;
  const leftSeat = playerAtEnd.east;
  const rightSeat = playerAtEnd.west;

  const leftPlayer = session.players.get(leftSeat);
  const rightPlayer = session.players.get(rightSeat);

  return {
    leftAxis: leftPlayer?.axis ?? 0,
    rightAxis: rightPlayer?.axis ?? 0,
  };
}
```

So on each tick:

1. It reads current input (`axis`) from both players.
2. Steps physics and game phases deterministically.
3. Broadcasts a new frame snapshot to clients.
4. Detects match‑over events and triggers result reporting when appropriate.

### 5.2 Why determinism matters

Deterministic stepping means:

- Given the same initial state, same random seed, and same sequence of inputs, the game will always evolve the same way.
- This makes debugging, replays, and fairness much easier.
- It also enables “input streaming” architectures, where only inputs + seed are persisted.

The Game Node uses:

- Fixed tick rate (`tickHz`).
- Quantized pause durations (`PauseQuantizer`).
- Server‑side random seed from the allocator/handoff.

---

## 6. Disconnects and resume

Long‑running WebSocket connections can drop (network blips, tab reload, etc.). The Game Node implements:

- **Grace windows** for reconnect.
- **Resume tokens** to re‑attach securely to an existing match.

### 6.1 Resume tokens (`ResumeTokenService`)

`apps/game-server/src/app/ResumeTokenService.ts`:

```ts
export class ResumeTokenService {
  async issue(params: IssueParams): Promise<{ resumeToken: string; claims: ResumeTokenClaims }> {
    const now = Math.floor(Date.now() / 1000);
    const ttlSeconds = Math.max(1, Math.ceil(params.ttlMs / 1000));
    const claims: ResumeTokenClaims = {
      iss: 'game-server',
      aud: 'game-server',
      iat: now,
      exp: now + ttlSeconds,
      jti: uuid(),
      roomIdentifier: params.roomIdentifier,
      sub: params.playerIdentifier,
      sessionIdentifier: params.sessionIdentifier,
    };
    const resumeToken = signResumeToken(claims);
    const key = `resume-token:${claims.jti}`;
    const setResult = await this.redis.set(
      key,
      JSON.stringify({ roomIdentifier: claims.roomIdentifier }),
      'EX',
      ttlSeconds,
      'NX',
    );
    if (setResult !== 'OK') throw new Error('resume-token-persist');
    return { resumeToken, claims };
  }

  async consume(token: string): Promise<ResumeTokenClaims | null> {
    const claims = verifyResumeToken(token);
    if (!claims) return null;
    if (claims.iss !== 'game-server' || claims.aud !== 'game-server') return null;
    const key = `resume-token:${claims.jti}`;
    const consumed = await this.redis.del(key);
    if (consumed !== 1) return null;
    return claims;
  }
}
```

Properties:

- Single‑use (Redis `del` must return 1).
- Short‑lived (TTL based on reconnect grace).
- Issued **only** by the Game Node; validated only by Game Node.

### 6.2 ReconnectManager and grace period

`apps/game-server/src/app/ReconnectManager.ts` coordinates disconnects:

- When a player disconnects:
  - Starts a **grace timer** based on `reconnectGraceMs` (policies differ for tournament vs casual).
  - Broadcasts `OPPONENT_DISCONNECTED` to the remaining player (see `protocol/net.ts`).
  - If the player reconnects in time:
    - Cancels the timer (`onReconnect`).
    - Notifies `OPPONENT_RECONNECTED`.
    - Resumes the match if it had started.
  - If the timer expires:
    - Determines the winner.
    - Uses `ResultReporter` to push an “opponent timeout” result.
    - Broadcasts `MATCH_END` with `reason: 'opponent_timeout'`.
    - Calls `onForfeit` callback (which in `GameServer` cleans up the session).

Frontend (`OnlineGame`) responds by:

- Showing appropriate snackbars (win by disconnect vs match ended due to disconnect).
- Transitioning to post‑match UI.

---

## 7. Match end and result reporting

When a match ends (either normally or via timeout/forfeit):

- `MatchRunner` calls `handleMatchOver`:
  - Stops the tick loop.
  - Uses `ResultReporter` to send results to the backend (MMR changes, history).
  - Broadcasts a `MATCH_END` message with `OnlineMatchSummary`.
  - Invokes `onCompleted` callback from `GameServer`.

`onMatchComplete` in `GameServer`:

- Logs a final message.
- Clears the session from `RoomRegistry`.
- Closes player sockets.
- Stops resume rotation timers.

From the client perspective:

- The game WebSocket receives `MATCH_END`.
- The render host calls `onEnd(MatchEndPayload)`.
- `useOnlineMatchEnd` in the frontend handles UI transitions.

---

## 8. How to reason about Game Node behavior

When you work on or debug the Game Node, keep this mental model:

1. **Room creation**:
   - Allocator calls HTTP admin → `RoomRegistry.registerRoom`.
   - Reservation includes players, sides, seed, start tick, deadlines.

2. **Connection & admission**:
   - Gateway proxies clients with verified join tokens.
   - WSServer verifies tokens again and binds players via `RoomRegistry.attachPlayer`.
   - Once both players are attached, `MatchRunner.scheduleStart` starts the game.

3. **Simulation**:
   - Tick loop reads inputs (`axis`) and steps game state via `stepOnce`.
   - Broadcaster sends frames and state updates to clients.

4. **Disconnects & resume**:
   - Resume tokens are rotated and sent to clients.
   - Reconnect within grace uses `resume` tokens via gateway → WSServer.
   - Late reconnect triggers a forfeit / opponent timeout result.

5. **End & cleanup**:
   - ResultReporter sends outcome to backend.
   - Session is cleared from `RoomRegistry`.
   - Sockets are closed and Redis state is cleaned up.

You can inspect:

- Game Node logs for room lifecycle, disconnects, and errors.
- Redis keys for `room-to-node:`, `resume-token:`, join tokens, and room reservations.
- Client‑side WS traffic for frames and match end messages.

---

## 9. Extending or safely modifying Game Node logic

If you need to modify or extend Game Node behavior:

- **Adding new events or stats**:
  - Extend `FrameEvents` / `ServerEvents` and update `Broadcaster`.
  - Extend `OnlineMatchSummary` in `protocol/net.ts` and the backend result handling.

- **Changing timing (tick rate, grace windows)**:
  - Adjust `tickHz` and `lagCompensationMs` in config.
  - Update `Policies.ts` for reconnect grace.
  - Be mindful of quantization in `PauseQuantizer`.

- **Modifying simulation rules**:
  - Changes live in `@pong/game-logic` (independent library).
  - Game Node simply consumes its APIs (`stepPaddles`, `handleSteps`, `createMatchController`).

- **Debugging determinism issues**:
  - Log seeds, tick numbers, and inputs for specific matches.
  - Reproduce with the same input stream and seed in a test environment.

The current design keeps Game Node relatively self‑contained, so you can reason locally about most issues without touching matchmaking or the gateway.
