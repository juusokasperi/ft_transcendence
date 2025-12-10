# Matchmaking Service – How It Works and How to Work With It

This document is a **course on the matchmaking service** used for the online Pong game. It explains:

- What the matchmaking service is responsible for.
- How it talks to the browser client and to other backend services.
- How its internal state and queues are organized.
- How handoff tokens and the game gateway fit into the overall workflow.
- How to extend or debug it safely.

It complements:

- `docs/dev/matchmaking/blueprint.md` – deep design doc for the control plane.
- `OnlinePongNetwork.md` – client‑centric network flow for online matches.
- `AllocatorAndScorer.md` – how rooms are allocated to game nodes.
- `GatewayAndWebSockets.md` – how `/matchmaking` and `/g/:roomId` WebSockets are wired.
- `BackendAndAPIs.md` – how matchmaking relies on backend user/MMR data.
- `ChatAndPresence.md` – how invite lobbies and chat‑started games interact with matchmaking.

For implementation details of infrastructure:

- `docs/to0nsa/node/RealtimeServers.md` – Fastify/WebSocket setup for the matchmaking server.
- `docs/to0nsa/redis/MatchmakingAndAllocator.md` – Redis usage for queues, room readiness, tournaments, and rate limiting.

Here we focus on **reading and working with the actual code** in `apps/matchmaking`.

---

## 1. Role in the architecture

The matchmaking service is part of the **control plane**:

- It owns **queues and pairing** (who plays whom).
- It is responsible for **tournaments** and **invite lobbies**.
- It issues **short‑lived join tokens** (via the allocator / Redis bridge) that allow players to join game rooms.

It does **not** run the Pong physics or game simulation itself. That job belongs to **Game Nodes**, which the client reaches via the **Gateway** (`apps/game-gateway/index.ts`).

High‑level flow (simplified):

1. Browser opens `/pong/online`.
2. Browser opens a WebSocket to `/matchmaking`.
3. Matchmaking authenticates the client and keeps track of its state.
4. The client sends `JOIN_QUEUE` messages to enter the queue.
5. Matchmaking pairs players, asks allocator/game nodes to create rooms, and then sends a `HANDOFF` message to the client with:
   - `gameServerWSUrl`, `roomIdentifier`, `joinToken`, etc.
6. The browser then connects to `/g/:roomId` via WebSocket with the join token; Gateway and Game Node take over.

---

## 2. Transport, entrypoint, and setup

Main file: `apps/matchmaking/index.ts`.

### 2.1 Fastify server and WebSocket route

Top‑level setup:

```ts
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import type { FastifyRequest } from 'fastify';
import type { WebSocket, RawData } from 'ws';
// ...

const app = Fastify({
  logger: createFastifyLoggerConfig({ service: 'matchmaking' }),
});

registerMetrics(app, { labels: { service: 'matchmaking' } });

await app.register(websocket);
```

This:

- Creates a Fastify server with structured logging.
- Registers a WebSocket plugin (`@fastify/websocket`).
- Registers metrics for observability.

WebSocket route:

```ts
app.get('/matchmaking', { websocket: true }, (socket: WebSocket, req) => {
  void handleConnection(socket, req);
});
```

So any browser that connects to `/matchmaking` via WebSocket ends up in `handleConnection`.

### 2.2 In‑memory and Redis state

Global state in `index.ts`:

```ts
const clients = new Map<string, ClientInfo>();
const pendingMatches = new Map<string, PendingMatch>();

const redis = new Redis(REDIS_URL);
const redisStream = redis.duplicate();
const redisPubSub = redis.duplicate();
const redisBridge = new MatchmakingRedisBridge(/* ... */);
await redisBridge.init();
const rateLimiter = new RedisTokenBucket(redis, 'mm:rl');
```

- `clients`: all currently connected clients (and some metadata).
- `pendingMatches`: matches that have been formed but are waiting for players to accept.
- `redis` / `redisStream` / `redisPubSub`: connections to Redis for:
  - Queue/room coordination.
  - Pending handoffs (allocator → matchmaking).
  - Tournament state updates.
- `redisBridge`: wraps the Redis stream/pubsub integration.
- `rateLimiter`: per‑client rate limiting for chatty messages, built on Redis.

Queue ticker:

```ts
const queueTicker = setInterval(() => {
  tryMatchQueue(pendingMatches);
}, 500);
```

Every 500 ms:

- `tryMatchQueue` inspects the queue (from `utils/queue.ts`).
- Attempts to form matches and schedule them with the allocator + game nodes.

---

## 3. Client connection lifecycle and authentication

### 3.1 Handling a new WebSocket connection

`handleConnection` in `apps/matchmaking/index.ts`:

```ts
async function handleConnection(socket: WebSocket, req: FastifyRequest) {
  const token = extractToken(socket, req.raw);
  if (!token) return;

  const id = uuid();
  const client: ClientInfo = {
    id,
    socket,
    ready: false,
    username: 'Unknown user',
    joinedAt: Date.now(),
    uuid: '',
    mmr: 1000,
    authenticated: false,
    lastRateLimitNotice: Date.now() - 5000,
    state: ClientState.IDLE,
    previousState: undefined,
  };
  log(`Client connected, validating.`, { clientId: client.id });
  const authenticated = await handleAuth(client, token, clients);
  if (!authenticated) return;
  clients.set(id, client);

  socket.send(JSON.stringify({ type: 'CONNECTED', clientId: id }));
  // ...
}
```

Flow:

1. **Extract auth token** from the WebSocket request (`extractToken` in `auth/auth.ts`).
2. **Create a ClientInfo** object with default values and a unique `id`.
3. **Authenticate** via `handleAuth`:
   - Validates the token against the backend auth/JWT.
   - Fills in `uuid`, `username`, `mmr`, etc.
4. If authentication fails, the function returns and the connection is closed.
5. On success:
   - Store `client` in the `clients` map.
   - Send `CONNECTED` message `{ type: 'CONNECTED', clientId: id }` to the client.

The browser side (in `useMatchmakingClient`) receives `CONNECTED` and updates the online state machine.

### 3.2 Restore tournament membership / lobbies

After `CONNECTED`:

```ts
await restoreTournamentMembership(client, clients);

if (await isInLobby(client)) {
  await handleInviteLobbyJoin(client);
  return;
}
```

The service:

- Checks if the client is mid‑tournament or in an invite lobby.
- If so, it immediately restores that context rather than letting the client join the main queue.

### 3.3 Handling client messages

The server listens for messages from the browser:

```ts
socket.on('message', async (raw: RawData) => {
  if (await isRateLimited(client, rateLimiter)) return;

  let data: MatchmakingClientMessage;
  try {
    data = JSON.parse(raw.toString());
  } catch {
    log(`Invalid message from ${id}:`, { raw: raw.toString() }, 'warn');
    return;
  }
  switch (data.type) {
    case 'JOIN_QUEUE':
      if (client.state === ClientState.IDLE) handleJoinQueue(client);
      else sendJoinConfirm(client);
      break;
    case 'CONFIRM_JOIN':
      if (client.state !== ClientState.IN_QUEUE) handleJoinConfirm(client);
      break;
    case 'LEAVE_QUEUE':
      if (client.state === ClientState.IN_QUEUE) handleLeaveQueue(client);
      break;
    case 'ACCEPT_MATCH':
      if (client.state === ClientState.PENDING_MATCH_ACCEPTANCE)
        handleAcceptMatch(data.matchId, client, pendingMatches);
      break;
    case 'DECLINE_MATCH':
      if (client.state === ClientState.PENDING_MATCH_ACCEPTANCE)
        handleDeclineMatch(data.matchId, client, pendingMatches);
      break;
    // ... tournament-related cases ...
    default:
      log('Unknown message', { type: (data as any).type ?? 'UNKNOWN' });
      client.socket.send(JSON.stringify({ type: 'ERROR', message: 'Unknown message from client' }));
  }
});
```

Important:

- Messages are strongly typed as `MatchmakingClientMessage` (see `protocol/net.ts`).
- `isRateLimited` uses Redis to throttle abusive clients.
- The `state` field on `ClientInfo` determines which messages are valid at any given time.

On close:

- Disconnect hooks clean up:
  - Clear any tournament membership.
  - Remove the client from `pendingMatches` and the queue.
  - `clients.delete(id)` and cleanup Redis state.

---

## 4. Internal state and queueing

Helpers live in `apps/matchmaking/utils/queue.ts`.

### 4.1 Client state and queue management

`ClientState` in `apps/matchmaking/types/types.ts` describes possible client states:

- `IDLE` – not in queue, not in match, not in tournament.
- `IN_QUEUE` – currently queued for a matchup.
- `PENDING_MATCH_ACCEPTANCE` – a match was found; awaiting acceptance.
- `IN_TOURNAMENT`, `IN_INVITE_LOBBY`, etc. – tournament/invite contexts.

Queue functions:

- `handleJoinQueue(client)`:
  - Puts client in the queue (internal queue structure + Redis if needed).
  - Updates `client.state` to `IN_QUEUE`.
  - Notifies the client with `QUEUE_JOINED`.
- `handleLeaveQueue(client)`:
  - Removes client from queue and sets state back to `IDLE`.
  - Sends `QUEUE_LEFT`.
- `removeFromQueue(id)` / `clearQueue()`:
  - Used on disconnect and service shutdown.

### 4.2 Matching and pending matches

`tryMatchQueue(pendingMatches: Map<string, PendingMatch>)`:

- Called periodically by `queueTicker`.
- Scans the queue for compatible pairs (by mode, MMR, etc. depending on `queue.ts` logic).
- When it finds a pair, it:
  - Creates a `PendingMatch` record:

    ```ts
    type PendingMatch = {
      id: string;
      a: ClientInfo;
      b: ClientInfo;
      timeoutAt: number;
      timer: NodeJS.Timeout;
      // ...
    };
    ```

  - Moves both clients to `PENDING_MATCH_ACCEPTANCE`.
  - Sends `MATCH_FOUND` messages to each client with:
    - `matchId`
    - opponent info `{ username, mmr }`

- It also starts a **timeout timer** (e.g., 30–60 seconds):
  - If players don’t accept within the window, it sends `MATCH_TIMEOUT` and reverts clients to safe states.

### 4.3 Accepting and declining matches

In `index.ts`, for `ACCEPT_MATCH`:

```ts
case 'ACCEPT_MATCH':
  if (client.state === ClientState.PENDING_MATCH_ACCEPTANCE)
    handleAcceptMatch(data.matchId, client, pendingMatches);
  break;
```

`handleAcceptMatch` (in `queue.ts`) does roughly:

- Mark that this client has accepted.
- If both players have accepted:
  - It informs the allocator / game nodes (via Redis bridge and pending handoffs).
  - The allocator creates a room on a game node and emits a **handoff** event through Redis.

Similarly, `handleDeclineMatch`:

- Cancels the `PendingMatch`.
- Sends `MATCH_DECLINED` message(s).
- Returns clients to `IDLE` or to their previous state.

---

## 5. Handoff and Redis bridge

The piece that connects **matchmaking** to **game nodes** is the **Redis bridge** and **pending handoffs**.

### 5.1 Redis bridge: subscribing to allocator/game node events

`apps/matchmaking/utils/MatchmakingRedisBridge.ts`:

```ts
export class MatchmakingRedisBridge {
  constructor(
    handlers: {
      onRoomReady: (payload: HandoffConfirmedPayload) => void;
      onMatchesReady: (payload: MatchesReadyPayload) => void;
      onStateUpdated: (payload: TournamentStateUpdatePayload) => void;
    },
    pubSub: Redis,
    stream: Redis,
  ) {
    // ...
  }
  async init() {
    // subscribe to Redis channels / streams, then call handlers...
  }
}
```

On initialization in `index.ts`:

```ts
const redisBridge = new MatchmakingRedisBridge(
  {
    onRoomReady: handleAdmitConfirmed,
    onMatchesReady: (payload) => handleTournamentMatchesReady(payload, clients),
    onStateUpdated: (payload) => handleTournamentStateUpdated(payload, clients),
  },
  redisPubSub,
  redisStream,
);
await redisBridge.init();
```

So when a game room has been created by the allocator/game nodes, **Redis** carries a message that triggers `handleAdmitConfirmed`.

### 5.2 Pending handoffs and `HandoffMessage`

`apps/matchmaking/utils/pendingHandoffs.ts`:

- Tracks matches that have been **allocated a room** but are waiting for clients to actually “admit” (confirm final join).
- `handleAdmitConfirmed`:
  - Receives payload from Redis when the allocator + game node confirm the room is ready.
  - Looks up the corresponding `PendingMatch`.
  - Sends `HANDOFF` message(s) to the clients:

    ```ts
    {
      type: 'HANDOFF',
      matchId,
      roomIdentifier,
      gameServerWSUrl,
      side: 'west' | 'east',
      joinToken,
      joinTokenTTLSeconds,
      randomSeed,
      simulationStartTick,
    }
    ```

These fields correspond to `HandoffMessage` in `packages/pong/shared/src/protocol/net.ts`.

On the **frontend**, `useMatchmakingClient` listens for `HANDOFF` and stores the payload in the online state, then `useGameBootstrap` uses it to connect to the **game gateway** and game node (see `OnlinePongNetwork.md`).

---

## 6. Tournaments and invite lobbies (overview)

The matchmaking service also supports:

- **Tournaments**:
  - Tournament creation, joining, leaving, and forfeiting.
  - Scheduled matches (semi/final/bronze) and state updates.
  - Messages like `TOURNAMENT_LOBBY_UPDATED`, `TOURNAMENT_BRACKET_SNAPSHOT`, `TOURNAMENT_MATCH_COUNTDOWN`, etc. defined in `protocol/net.ts`.
  - Handled by `utils/scheduledMatches.ts` and the Redis bridge.

- **Invite lobbies**:
  - Invite‑based 1v1 matches via endpoints like `/invite-match`.
  - `inviteRoute`, `handleInviteLobbyJoin`, `isInLobby`, etc. in `utils/invites.ts`.

From the client perspective:

- These map to additional message types in `MatchmakingMessage`.
- Frontends can choose to:
  - Implement extra UI for tournaments and invites.
  - Or ignore these messages if only simple matchmaking is needed.

For a junior‑level understanding, it’s enough to know:

- Tournaments and invites reuse the **same control plane**.
- They ultimately also produce **handoffs** to game nodes using the same join token mechanism.

---

## 7. Rate limiting and abuse protection

Two important pieces:

1. **Per‑client rate limiting**:
   - Implemented via `RedisTokenBucket` (`@utils/rate-limiter`) and `utils/ratelimit.ts`.
   - `isRateLimited(client, rateLimiter)` is called on every incoming message:

     ```ts
     socket.on('message', async (raw) => {
       if (await isRateLimited(client, rateLimiter)) return;
       // ...
     });
     ```

   - Prevents spam and protects matchmaking from abuse.

2. **Pending match timeouts**:
   - `PendingMatch` includes a `timer`.
   - If players do not accept in time:
     - `MATCH_TIMEOUT` is sent.
     - Match is removed from `pendingMatches`.
     - Clients are returned to safe states.

These safeguards matter because the matchmaking service is on the hot path for real‑time gameplay; unbounded spam or stuck matches would degrade the whole experience.

---

## 8. How the client sees matchmaking (protocol summary)

From the browser’s perspective (see `MatchmakingClientMessage` / `MatchmakingMessage` in `protocol/net.ts`):

### Client → Server messages (MatchmakingClientMessage)

- `JOIN_QUEUE`
- `LEAVE_QUEUE`
- `ACCEPT_MATCH`
- `DECLINE_MATCH`
- `CONFIRM_JOIN`
- Tournament‑related: `CREATE_TOURNAMENT`, `JOIN_TOURNAMENT`, `LEAVE_TOURNAMENT`, `FORFEIT_TOURNAMENT`, `ACCEPT_SCHEDULED`

### Server → Client messages (MatchmakingMessage)

- `CONNECTED` – confirmation of connection and authentication.
- `QUEUE_JOINED`, `QUEUE_LEFT` – queue membership status.
- `MATCH_FOUND` – opponent + `matchId` found.
- `MATCH_DECLINED`, `MATCH_TIMEOUT` – match cancelled or expired.
- `HANDOFF` – game node URL + room ID + join token.
- `HANDOFF_TIMEOUT` – room creation/join failed.
- `ERROR` – structured error codes (e.g. `AUTH`, `ALLOCATOR`, `RATELIMIT`).
- `CONFIRM_REQUIRED` – user must confirm continuing from current lobby/tournament state.
- Tournament messages (`TOURNAMENT_LOBBY_UPDATED`, `TOURNAMENT_BRACKET_SNAPSHOT`, `TOURNAMENT_MATCHES_READY`, `TOURNAMENT_MATCH_COUNTDOWN`).

React hook `useMatchmakingClient`:

- Decodes these messages.
- Dispatches actions to the online state machine (`online/state/machine`).
- Calls high‑level handlers provided by `OnlineGame` to show snackbars, confirmations, or navigate.

---

## 9. How to extend or debug the matchmaking service

### 9.1 Extending behavior

To add a new feature that involves matchmaking:

1. **Define or extend protocol types**:
   - Add new fields or message types in `packages/pong/shared/src/protocol/net.ts`.
   - Rebuild so both backend and frontend share updated types.

2. **Update server handling**:
   - Add handling in `apps/matchmaking/index.ts`’s `switch (data.type)`.
   - If needed, add logic in `utils/queue.ts`, `utils/scheduledMatches.ts`, or a new helper file.

3. **Update client handling**:
   - Extend `useMatchmakingClient`’s `switch (msg.type)`.
   - Add new actions in the online state machine and new UI components where needed.

Always keep state transitions consistent with `ClientState` and ensure:

- `JOIN_QUEUE` is only allowed from `IDLE` (or with explicit confirmation).
- `ACCEPT_MATCH` / `DECLINE_MATCH` only from `PENDING_MATCH_ACCEPTANCE`.

### 9.2 Debugging issues

- Use **browser DevTools** WS panel to inspect `/matchmaking` messages.
- Check **matchmaking logs** (Fastify logger) for:
  - Auth failures.
  - Unexpected client states.
  - Queue activity and match formation.
- Check **Redis** contents if needed:
  - Queue keys, pending handoff streams.
  - Rate limiter buckets.

If something looks stuck:

- Confirm that `queueTicker` is running and calling `tryMatchQueue`.
- Ensure Redis and the Redis bridge are healthy (no connection issues).
- Inspect `pendingMatches` on the server (via logs or temporary debug endpoints).

---

## 10. Summary

The matchmaking service:

- Is a stateful WebSocket server that:
  - Authenticates players.
  - Manages queues and match pairing.
  - Drives tournaments and invite lobbies.
  - Listens to allocator/game nodes via Redis to know when rooms are ready.
  - Sends **handoff** messages with join tokens so the client can connect to game nodes via the gateway.

To work with it confidently:

- Understand the **client → server message flow** (`JOIN_QUEUE`, `ACCEPT_MATCH`, etc.).
- Understand the **server → client messages** (`MATCH_FOUND`, `HANDOFF`, `ERROR`, etc.).
- Know how state is tracked (`ClientState`, `clients` map, `pendingMatches`, queue).
- Know how it integrates with Redis and the game gateway.

Together with `OnlinePongNetwork.md` and the TypeScript/React/browser docs, this gives you a complete picture of how matchmaking fits into the ft_transcendence online game stack.
