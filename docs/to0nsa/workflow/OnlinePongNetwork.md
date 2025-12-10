# Online Pong – Network Workflow (End to End)

This is a step‑by‑step guide to how the **online Pong mode** works over the network, from the moment a user opens `/pong/online` to the end of a match (and resume).

It ties together:

- Frontend React code under `apps/frontend/src/pages/pong/online/`
- The matchmaking service (`apps/matchmaking`)
- The game gateway (`apps/game-gateway/index.ts`)
- Shared protocol types (`packages/pong/shared/src/protocol/net.ts`)

For a fuller picture, also see:

- `browser.md` – browser/React fundamentals behind this flow.
- `MatchmakingService.md` – matchmaking internals and queue state.
- `AllocatorAndScorer.md` – how rooms and join tokens are created.
- `GatewayAndWebSockets.md` – how `/g/:roomId` connections are admitted and routed.
- `GameNode.md` – how the server‑authoritative simulation works once connected.
  - `OnlinePongDataPlane.md` – detailed view of ticks, `FRAME` messages, and latency handling once the game WS is running.
  - `OnlinePongReconnect.md` – reconnect & resume behavior (resume tokens, grace windows, reconnect UX).
  - `InviteMatchFlow.md` – invite‑based matches starting from `/chat` and `/invite-match`.
- `BackendAndAPIs.md` and `ResultsAndRanking.md` – how results are persisted and turned into stats.
- `docs/to0nsa/node/RealtimeServers.md` – how the matchmaking, chat, gateway, and game WS servers are structured.
- `docs/to0nsa/redis/Redis.md` – how Redis ties together matchmaking, allocator, gateway, and game servers.

For a low‑level view of all WS messages and close codes, see:

- `ProtocolReference.md`.

The goal is to help you **read and extend** the online game flow with confidence.

---

## 0. High‑level architecture

At a high level (see also `docs/dev/matchmaking/blueprint.md`):

- **Browser client** connects via WebSocket to **Matchmaking**.
- Matchmaking chooses an opponent and asks **Allocator + Game Node** to create a room (not shown in code here, but described in the blueprint).
- Once the room is ready, Matchmaking sends the client a **handoff**: game server URL, room ID, join token, random seed, etc. (`HandoffMessage`).
- The browser then connects via WebSocket to the **Gateway** at `/g/:roomId`, which forwards the connection to the correct **Game Node**.
- The Game Node runs the authoritative simulation and sends game snapshots; at the end it sends a summary that the client displays.

The rest of this doc walks through that from the client’s perspective, then shows how it maps to backend services.

---

## 1. User opens the online Pong page

Route: `/pong/online`  
Component: `apps/frontend/src/pages/pong/online/OnlineGame.tsx`

When the user navigates to the online page:

- `App.tsx` routes `/pong/online` to `<OnlineGame />` inside `PongLayout`.
- `OnlineGame`:
  - Creates a `canvasRef` for the Pong canvas.
  - Initializes a `useReducer` state machine (`initialState`, `reducer` in `./state/machine`).
  - Reads user info and helpers from `useAppContext()` (Axios instance, `setUser`, `navigate`, etc.).
  - Sets up snackbar (`useSnackbar`) and match activity context (`useSetMatchActivity`).
  - Computes `matchmakingEnabled` based on user readiness and current status.

The initial state is something like:

- Status: `'idle'` or `'connecting'`.
- No `serverUrl`, `roomIdentifier`, `matchId`, `joinToken`, or `randomSeed` yet.

---

## 2. Connecting to Matchmaking (WebSocket)

Hook: `apps/frontend/src/pages/pong/online/hooks/useMatchmakingClient.ts`  
Client helper: `apps/frontend/src/services/matchmaking.ts`  
Server: `apps/matchmaking/index.ts`

### 2.1 Creating the matchmaking WebSocket client

`OnlineGame` calls:

```ts
const { joinQueue, leaveQueue, acceptMatch, declineMatch, confirmJoin } = useMatchmakingClient({
  /* ... */
});
```

`useMatchmakingClient`:

- Uses `createMatchmakingClient` from `apps/frontend/src/services/matchmaking.ts`.
- The client:
  - Opens a WebSocket to `wsUrl('/matchmaking')` (for example `/matchmaking` on the same origin).
  - Sends/receives JSON messages defined in `MatchmakingMessage` (see `protocol/net.ts`).

On the server:

- `apps/matchmaking/index.ts`:
  - Registers a WebSocket route: `app.get('/matchmaking', { websocket: true }, ...)`.
  - In `handleConnection`, authenticates the client (via `handleAuth`).
  - Sends an initial message:

    ```ts
    socket.send(JSON.stringify({ type: 'CONNECTED', clientId: id }));
    ```

### 2.2 Handling matchmaking messages on the client

In `useMatchmakingClient`, `createMatchmakingClient` is given a callback:

```ts
const client = createMatchmakingClient((msg: MatchmakingMessage) => {
  /* switch (msg.type) */
});
```

Main message types from `packages/pong/shared/src/protocol/net.ts`:

- `CONNECTED` – client is authenticated, has a `clientId`.
- `QUEUE_JOINED` / `QUEUE_LEFT` – queue membership state.
- `MATCH_FOUND` – a potential opponent was found.
- `MATCH_DECLINED` / `MATCH_TIMEOUT` – match cancelled or expired.
- `HANDOFF` – **critical step**: includes game server URL, room ID, and join token.
- `ERROR` – auth errors, allocator errors, rate limits.
- `CONFIRM_REQUIRED` – asks user to confirm joining when already in a tournament/lobby.
- Tournament‑related messages (used by tournament views; not central for basic online play).

The hook dispatches actions to the online state machine:

```ts
switch (msg.type) {
  case 'CONNECTED':
    handlers.dispatch({ type: 'connected', clientId: msg.clientId });
    break;
  case 'QUEUE_JOINED':
    handlers.dispatch({ type: 'queueJoined' });
    break;
  case 'MATCH_FOUND':
    handlers.dispatch({
      type: 'matchFound',
      matchId: msg.matchId,
      opponent: { username: msg.opponent.username, mmr: msg.opponent.mmr },
    });
    break;
  case 'HANDOFF':
    handlers.dispatch({
      type: 'handoff',
      payload: {
        serverUrl: msg.gameServerWSUrl,
        matchId: msg.matchId,
        roomIdentifier: msg.roomIdentifier,
        side: msg.side,
        randomSeed: msg.randomSeed,
        joinToken: msg.joinToken,
      },
    });
    break;
  // ...
}
```

On the server (`apps/matchmaking/index.ts`), incoming messages are parsed as `MatchmakingClientMessage` and handled by `switch (data.type)`:

- `JOIN_QUEUE` → `handleJoinQueue` / `tryMatchQueue`.
- `CONFIRM_JOIN` → `handleJoinConfirm`.
- `LEAVE_QUEUE` → `handleLeaveQueue`.
- `ACCEPT_MATCH` / `DECLINE_MATCH` → `handleAcceptMatch` / `handleDeclineMatch`.
- Tournament‑related messages.

From the client’s perspective:

- You call `joinQueue()` / `leaveQueue()` / `acceptMatch(matchId)` etc.
- The hook sends JSON messages, and **reacts to server messages** by updating local state and calling handlers (snackbars, confirmations, etc.).

---

## 3. From queue to handoff

### 3.1 Joining the queue

User clicks “Join queue”:

- `QueueControls` calls `onJoinQueue`, which is wired to `joinQueue()` from `useMatchmakingClient`.
- Client sends `{ type: 'JOIN_QUEUE' }` over the matchmaking WebSocket.

Server (`apps/matchmaking/index.ts`):

- On `JOIN_QUEUE`:
  - Validates client state (`ClientState.IDLE`).
  - Adds client to the queue (`handleJoinQueue`).
  - Sends `QUEUE_JOINED` back to the client.
- A background timer (`queueTicker`) calls `tryMatchQueue(pendingMatches)` every 500 ms:
  - Pairs players.
  - Interacts with allocator + game nodes via Redis (`MatchmakingRedisBridge`).
  - Ultimately arranges a `PendingMatch` and sends confirm/accept prompts to players.

Client:

- Receives `QUEUE_JOINED` → state becomes `'in_queue'`.
- UI shows “In queue. Looking for an opponent.” and queue elapsed time (`useQueueTimer`).

### 3.2 Match found and acceptance

When a match is created:

- Server sends `MATCH_FOUND`:

  ```ts
  {
    type: 'MATCH_FOUND',
    matchId: string,
    opponent: { username: string; mmr: number }
  }
  ```

Client:

- State moves to `'match_found'` with `matchId` and opponent details.
- UI shows `MatchFoundPanel` with accept/decline buttons.

User accepts:

- Client sends `{ type: 'ACCEPT_MATCH', matchId }`.
- Server moves client to `PENDING_MATCH_ACCEPTANCE` state and waits for both players.

### 3.3 Handoff: moving from matchmaking to game server

Once both players accept and the Allocator + Game Node have created a room, Matchmaking sends a **handoff** (`HandoffMessage` in `protocol/net.ts`):

```ts
export type HandoffMessage = {
  type: 'HANDOFF';
  matchId: string;
  roomIdentifier: string;
  gameServerWSUrl: string;
  side: 'west' | 'east';
  joinToken: string;
  joinTokenTTLSeconds: number;
  randomSeed: number;
  simulationStartTick: number;
  tournament?: TournamentContext;
};
```

The important fields:

- `roomIdentifier` – the ID of the game room (also used in the gateway URL `/g/:roomId`).
- `gameServerWSUrl` – the WebSocket URL the client should use (goes through gateway).
- `joinToken` – short‑lived, single‑use token proving the player is allowed to join this room.
- `side` – `'west'` or `'east'` (initial paddle side).
- `randomSeed` – used to seed the deterministic game simulation.

Client:

- `useMatchmakingClient` dispatches a `handoff` action with this payload.
- The online state stores:
  - `serverUrl` (WebSocket endpoint)
  - `roomIdentifier`
  - `matchId`
  - `joinToken`
  - `randomSeed`
  - `seat` (P1/P2 mapping)

At this point, the **matchmaking WS stays open, but the game WS connection is about to start**.

---

## 4. Connecting through the Gateway to the Game Node

Gateway: `apps/game-gateway/index.ts`

The online game code doesn’t open this connection directly; instead, `useGameBootstrap` + `createOnlineWorld` (in `@pong/render`) handle it under the hood. But it’s important to understand what happens on the server side.

### 4.1 Gateway WebSocket upgrade

The gateway listens on its own port and intercepts WebSocket upgrades:

```ts
app.server.on('upgrade', async (req, socket, head) => {
  const match = req.url?.match(/^\/g\/([a-zA-Z0-9_-]+)/);
  // roomId is extracted from /g/:roomId
  // ...
});
```

Key steps:

1. **Validate URL** – must match `/g/:roomId`.
2. **Check `Sec-WebSocket-Protocol` header**:
   - Extract a `resume` token (for reconnect) or a `bearer` join token.
   - Tokens are encoded in the **subprotocol list**.
3. **Verify token**:
   - Join tokens via `verifyJoinToken` (`@pong/shared/auth/tokenSign`).
   - Resume tokens via `verifyResumeToken`.
   - Validate issuer (`iss`), audience (`aud`), room identifier, etc.
4. **Lookup game node** in Redis:

   ```ts
   const gameNode = await redis.get(`room-to-node:${roomId}`);
   ```

5. If using a **join token**:
   - Mark it as consumed using Redis (`join-token:${jti}`) with TTL so it’s single‑use.

6. **Proxy the WebSocket** to the game node:

   ```ts
   const success = await proxyWithRetry(req, socket, head, gameNode);
   ```

From the client’s perspective:

- It connects to the game server URL (something like `/g/:roomId`).
- The Gateway ensures the token is valid and then tunnels the connection to the right game node.

---

## 5. Bootstrapping the Pong client (`useGameBootstrap`)

Hook: `apps/frontend/src/pages/pong/online/hooks/useGameBootstrap.ts`  
Shared bootstrap: `@pong/render` online host (via `createOnlineWorld`)

### 5.1 Building the bootstrap config

In `OnlineGame`:

```ts
const bootstrapConfig = useBootstrapConfig(state);
```

`useBootstrapConfig` makes sure all required fields are present:

```ts
if (
  !state.serverUrl ||
  !state.matchId ||
  !state.roomIdentifier ||
  state.joinToken === null ||
  state.randomSeed === null
) {
  return null;
}
return {
  serverUrl: state.serverUrl,
  matchId: state.matchId,
  roomIdentifier: state.roomIdentifier,
  joinToken: state.joinToken,
  randomSeed: state.randomSeed,
  seat: state.seat,
};
```

Only when `bootstrapConfig` is non‑null is the client ready to bootstrap the game.

### 5.2 Starting the online Pong app

`useGameBootstrap`:

- Accepts:
  - `canvasRef` – where to render the game.
  - `active` – whether a match is currently active.
  - `config` – server URL, room ID, join token, etc.
  - `onStarted` – callback when match is officially started.
  - `onEnded` – callback with match end payload (`MatchEndPayload`).
- Uses a `useEffect` to bootstrap when `active` and `config` are ready:

  ```ts
  useEffect(() => {
    if (!active || !canvasRef.current || !config) return;
    if (bootingRef.current || appRef.current) return;

    bootingRef.current = true;
    (async () => {
      // dynamic import to load heavy bundle
      const { createOnlineWorld, bootstrapOnlinePong } = await import(
        '../../../../games/pong/host/online-embed'
      );
      // createOnlineWorld sets up Babylon scene, camera, etc.
      // bootstrapOnlinePong connects to the game server via WebSocket, using the join token.
      const instance = await bootstrapOnlinePong({
        canvas: canvasRef.current,
        config,
        onEnd: onEnded,
      });
      appRef.current = instance;
      onStarted();
    })().catch(/* handle bootstrap failure */);
  }, [active, canvasRef, config, onEnded, onStarted]);
  ```

- `bootstrapOnlinePong` (in the render package) is responsible for:
  - Opening the WebSocket to `config.serverUrl` (through the Gateway).
  - Attaching the join token as a subprotocol.
  - Handling the game protocol messages (`FRAME`, `ROOM_STATE`, `START`, `MATCH_END`, etc. from `protocol/net.ts`).
  - Driving the Babylon scene and game loop.
  - Emitting a `pong:matchOver` event and calling `onEnd` when the match ends.

From the network perspective, this is where the **game server WebSocket** is established and driven.

---

## 6. Match lifecycle and end

Hook: `apps/frontend/src/pages/pong/online/hooks/useOnlineMatchEnd.ts`

The game engine calls `onEnd(MatchEndPayload)` (from the render side) when the match ends.

`useOnlineMatchEnd`:

- Receives:
  - `seat` (P1/P2),
  - `dispatch` (online state actions),
  - `enqueueSnackbar`,
  - `delayMs` (when to show post‑match UI).
- Returns `handleMatchEnd`, which is passed to `useGameBootstrap`’s `onEnded`.

Based on `payload.reason`:

- **`bootstrap_failed`**:
  - Show error snackbar.
  - Call `onBootstrapFailed` (navigate back to `/pong/online`).

- **`forfeit`**:
  - Show post‑match UI after a fixed delay (5 s).

- **`opponent_timeout`**:
  - Show appropriate snackbar (win by disconnect / ended by disconnect).
  - Then show post‑match UI after delay.

- **`completed` + summary**:
  - After `delayMs`, call `dispatch({ type: 'showPostMatch', summary })`.

Otherwise:

- `dispatch({ type: 'endMatch', payload })`.

React + network interaction:

- The game server sends `MATCH_END` and final summary (`OnlineMatchSummary`).
- Render engine translates that into a `MatchEndPayload`.
- `OnlineGame` moves to `'postmatch'` state and shows `PostMatchOnlineView` with stats.

---

## 7. Resume tokens and reconnects (overview)

The network design supports **resume** via `ResumeTokenMessage` and `ResumeTokenClaims` (see `protocol/net.ts` and the blueprint).

Front‑end pieces:

- `findAnyStoredResumeCandidate` (`apps/frontend/src/games/pong/modes/online/resume`) checks local storage for a resume token and room info.
- `OnlineGame` has an effect:

  ```ts
  useEffect(() => {
    if (!userReady || !user) return;
    if (state.status !== 'idle') return;
    if (skipAutoResumeRef.current) return;
    const candidate = findAnyStoredResumeCandidate();
    if (!candidate) return;
    dispatch({
      type: 'handoff',
      payload: {
        serverUrl: `/g/${candidate.roomIdentifier}`,
        matchId: 'resume',
        roomIdentifier: candidate.roomIdentifier,
        side: 'east', // placeholder; corrected after resume
        randomSeed: 0,
        joinToken: '',
      },
    });
  }, [state.status, userReady, user, dispatch]);
  ```

- After this, the game bootstrap path connects to the room using a **resume token** instead of a join token.

Gateway + Node:

- Gateway validates `resume` subprotocol token via `validateResume`.
- Node resumes the simulation if within the grace window.

From a workflow standpoint:

- Resume reuses the same steps as “handoff → game bootstrap”, but uses a different token type and slightly different config.

---

## 8. Putting it all together – user journey

1. **User visits `/pong/online`**:
   - React loads `OnlineGame`.
   - `useMatchmakingClient` creates a WebSocket connection to `/matchmaking`.
   - Server authenticates and sends `CONNECTED`.

2. **User joins the queue**:
   - `JOIN_QUEUE` message is sent.
   - Matchmaking puts the client in the queue and sends `QUEUE_JOINED`.

3. **Matchmaking pairs an opponent**:
   - After allocator + game node setup, server sends `MATCH_FOUND`.
   - UI shows opponent info and accept/decline.

4. **User accepts the match**:
   - `ACCEPT_MATCH` is sent.
   - When both players accept and the room is ready, server sends `HANDOFF` with:
     - `gameServerWSUrl`, `roomIdentifier`, `joinToken`, `randomSeed`, `simulationStartTick`, etc.

5. **Client bootstraps the game**:
   - Online state stores handoff data.
   - `useBootstrapConfig` returns a valid config.
   - `useGameBootstrap` loads the Online Pong host and connects via WebSocket to `/g/:roomId` using the join token.
   - Gateway validates the token and proxies to the correct game node.

6. **Match plays out**:
   - Game node sends snapshots (`FRAME`, `ROOM_STATE`, `START`).
   - Client renders using Babylon; user sees live Pong.
   - Match activity context is set to true (disables chat UI in `App.tsx`).

7. **Match ends**:
   - Game node sends `MATCH_END` with reason and optional `OnlineMatchSummary`.
   - `useGameBootstrap` calls `onEnded`; `useOnlineMatchEnd` shows snackbars and moves state to `'postmatch'`.
   - UI shows `PostMatchOnlineView` with scores and MMR changes.

8. **Optional resume**:
   - If the user disconnects mid‑match and reconnects within the grace window, a resume token allows the client to reconnect via `/g/:roomId` with `resume` token.
   - The game node restores the room; client jumps back into `starting`/`playing` state.

---

## 9. How to extend or debug this flow

- To **add new matchmaking features** (like modes/regions):
  - Extend `MatchmakingClientMessage` / `MatchmakingMessage`.
  - Update `apps/matchmaking/index.ts` handlers.
  - Add cases to `useMatchmakingClient` and the online state machine.

- To **debug network issues**:
  - Inspect the browser’s Network → WS tab (look at `/matchmaking` and `/g/:roomId`).
  - Check gateway logs (`apps/game-gateway/index.ts`) for upgrade and token validation messages.
  - Check matchmaking logs for client state transitions and errors.

- To **change timing or error handling**:
  - Adjust online state machine transitions and `useOnlineMatchEnd` delays.
  - Tweak timeouts and TTLs in the backend (see `docs/dev/matchmaking/blueprint.md` for defaults and rationale).

This workflow document should give you a mental map of how the online Pong mode talks to the backend so you can confidently make changes on either side.
