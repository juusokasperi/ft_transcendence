# Game Gateway & WebSockets – How the Pieces Fit Together

This document is a **course on the game gateway and WebSockets** in ft_transcendence. It focuses on:

- The **game gateway** (`apps/game-gateway/index.ts`) that sits between browsers and game nodes.
- How WebSockets are used in:
  - Matchmaking (`/matchmaking`)
  - Game traffic (`/g/:roomId`)
  - Realtime chat/presence (`/chat`)
- How tokens, headers, and subprotocols are used to secure connections.

Read this together with:

- `OnlinePongNetwork.md` – end‑to‑end online flow from the browser’s perspective.
- `MatchmakingService.md` – matchmaking internals and how handoff URLs/tokens are produced.
- `GameNode.md` – what happens to WebSocket traffic once it reaches a game server.
- `SecurityAndTokens.md` – detailed overview of join/resume token shapes and secrets.
- `browser.md` – browser view of WebSockets and networking.

For implementation details:

- `docs/to0nsa/node/RealtimeServers.md` – how the game gateway and WS servers are built with Fastify.
- `docs/to0nsa/redis/GameServerAndGateway.md` – Redis keys used for room routing and token enforcement.

---

## 1. What the gateway does (and doesn’t do)

**Gateway responsibilities** (`apps/game-gateway/index.ts`):

- Acts as the **single public entry point** for game WebSockets on `/g/:roomId`.
- Validates **join** and **resume tokens** embedded in WebSocket subprotocols.
- Looks up which **game node** hosts the requested room (via Redis).
- Proxies the WebSocket connection to that game node, with retries and logging.

The gateway **does not**:

- Run the Pong simulation.
- Manage matchmaking queues.
- Understand game messages (`FRAME`, `ROOM_STATE`, …).

Instead, it is a **secure router** and **admission gate** for real‑time game traffic.

Matchmaking (`apps/matchmaking`) and game nodes handle everything else.

---

## 2. WebSocket basics in this codebase

There are three main WebSocket flows:

1. **Matchmaking**: browser ↔ `apps/matchmaking` via `/matchmaking`  
   (handled by `useMatchmakingClient` + `createMatchmakingClient`).
2. **Game**: browser ↔ `apps/game-gateway` via `/g/:roomId` ↔ game node  
   (used by the Pong “online host” in `@pong/render`).
3. **Realtime chat/presence**: browser ↔ `/chat`  
   (handled by `RealtimeSocketContext`).

The browser always uses the **standard WebSocket API**:

```ts
const ws = new WebSocket(url);
ws.onopen = () => {
  /* ... */
};
ws.onmessage = (ev) => {
  /* ... */
};
ws.onerror = (err) => {
  /* ... */
};
ws.onclose = () => {
  /* ... */
};
ws.send(JSON.stringify(payload));
```

The difference between flows is:

- Which URL they connect to.
- What JSON protocol they speak.
- Whether they go directly to a service (matchmaking, chat) or via the game gateway.

---

## 3. Game gateway in detail (`apps/game-gateway/index.ts`)

### 3.1 Setup and Redis

At the top:

```ts
import fastify from 'fastify';
import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import createProxyServer from 'http-proxy';
import Redis from 'ioredis';
import { REDIS_URL, PORT } from './config';
import { verifyJoinToken, verifyResumeToken } from '@pong/shared/auth/tokenSign';
import { registerMetrics } from '@utils/metrics';
import { createFastifyLoggerConfig } from '@utils/logger';

const redis = new Redis(REDIS_URL);

const app = fastify({
  logger: createFastifyLoggerConfig({ service: 'game-gateway' }),
});

registerMetrics(app, { labels: { service: 'game-gateway' } });
```

Key points:

- Gateway is a Fastify server with structured logs and Prometheus metrics.
- `redis` is used to:
  - Map `roomId` → game node address (`room-to-node:${roomId}`).
  - Coordinate with other services if needed.

### 3.2 Parsing subprotocols and tokens

Clients send join/resume tokens via the `Sec-WebSocket-Protocol` header as a **comma‑separated list**, e.g.:

```http
Sec-WebSocket-Protocol: bearer,<joinToken>
```

or for resume:

```http
Sec-WebSocket-Protocol: resume,<resumeToken>
```

Gateway helpers:

```ts
const parseProtocols = (header: string | string[] | undefined) =>
  (typeof header === 'string' ? header : '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

const extractToken = (protocols: string[], tag: string) => {
  const idx = protocols.findIndex((p) => p.toLowerCase() === tag);
  return idx !== -1 ? protocols[idx + 1] : undefined;
};
```

Token verification:

```ts
const validateJoin = (token: string | undefined, roomId: string) => {
  if (!token) return null;
  const claims = verifyJoinToken(token);
  if (!claims) return null;
  if (claims.roomIdentifier !== roomId) return null;
  if (claims.iss !== 'mm' || claims.aud !== 'game-node') return null;
  return claims;
};

const validateResume = (token: string | undefined, roomId: string) => {
  if (!token) return null;
  const claims = verifyResumeToken(token);
  if (!claims) return null;
  if (claims.roomIdentifier !== roomId) return null;
  if (claims.iss !== 'game-server' || claims.aud !== 'game-server') return null;
  return claims;
};
```

The gateway:

- Ensures tokens are **valid JWTs** and:
  - Refer to the correct `roomIdentifier`.
  - Come from the expected issuer (`iss`) and audience (`aud`).
- Distinguishes between **first join** and **resume**.

### 3.3 Upgrade handler: routing `/g/:roomId`

Fastify’s underlying Node server emits `upgrade` events for WebSocket connections:

```ts
app.server.on('upgrade', async (req: IncomingMessage, socket: Duplex, head: Buffer) => {
  app.log.info('[Gateway] Upgrade connection started');
  const match = req.url?.match(/^\/g\/([a-zA-Z0-9_-]+)/);
  if (!match) {
    app.log.info({ url: req.url }, '[Gateway] Invalid url:');
    socket.destroy();
    return;
  }

  const roomId = match[1];
  // ...
});
```

Steps:

1. **Validate URL**:
   - Must be `/g/:roomId`, where `roomId` is alphanumeric/underscore/hyphen.
   - If invalid, the gateway logs and destroys the socket.

2. **Check subprotocol header**:

   ```ts
   const protocolHeader = req.headers['sec-websocket-protocol'];
   if (typeof protocolHeader !== 'string') {
     app.log.info({ roomId }, '[Gateway] Missing Sec-WebSocket-Protocol header for room:');
     socket.write('HTTP/1.1 4401 Unauthorized\r\nConnection: close\r\n\r\n');
     socket.destroy();
     return;
   }
   ```

   - Without `Sec-WebSocket-Protocol`, no token can be extracted → unauthorized.

3. **Extract join or resume token**:

   ```ts
   const protocols = parseProtocols(protocolHeader);
   const resumeToken = extractToken(protocols, 'resume');
   const joinToken = resumeToken ? undefined : extractToken(protocols, 'bearer');

   const resumeClaims = resumeToken ? validateResume(resumeToken, roomId) : null;
   const joinClaims = !resumeClaims && joinToken ? validateJoin(joinToken, roomId) : null;

   if (!resumeClaims && !joinClaims) {
     app.log.info({ roomId }, '[Gateway] Unauthorized attempt');
     socket.write('HTTP/1.1 4401 Unauthorized\r\nConnection: close\r\n\r\n');
     socket.destroy();
     return;
   }
   ```

   - **Resume wins** if present.
   - If neither token is valid, the gateway returns a 4401 and closes the connection.

4. **Lookup game node in Redis**:

   ```ts
   let gameNode: string | null = null;
   try {
     gameNode = await redis.get(`room-to-node:${roomId}`);
   } catch (err) {
     app.log.info({ roomId }, '[Gateway] No game node found for room:');
     socket.destroy();
     return;
   }

   if (!gameNode) {
     app.log.info('[Gateway] Game node is null');
     socket.destroy();
     return;
   }
   ```

   - `room-to-node:${roomId}` is populated by allocator/game-node coordination.
   - Points to a URL like `ws://game-node-1:PORT`.

5. **Enforce single‑use join tokens**:

   If this is a join (not resume):

   ```ts
   if (joinClaims) {
     const nowSec = Math.floor(Date.now() / 1000);
     const ttlSeconds = Math.max(1, (joinClaims.exp ?? nowSec) - nowSec);
     const jtiKey = `join-token:${joinClaims.jti}`;

     const setResult = await redis.set(jtiKey, roomId, 'EX', ttlSeconds, 'NX');
     if (setResult !== 'OK') {
       // join token already consumed
       socket.write('HTTP/1.1 4403 Forbidden\r\nConnection: close\r\n\r\n');
       socket.destroy();
       return;
     }
   }
   ```

   - Uses Redis `SET` with `NX` + TTL to ensure **single-use** tokens.

6. **Proxy the WebSocket to the game node**:

   ```ts
   try {
     const success = await proxyWithRetry(req, socket, head, gameNode);
     if (success) app.log.info(`[Gateway] Routed room ${roomId} to ${gameNode}`);
     else {
       socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
       socket.destroy();
     }
   } catch (err) {
     // log, then 502
   }
   ```

   - `proxyWithRetry` wraps `http-proxy` with retry/backoff logic for transient connection issues.
   - The gateway forwards `Sec-WebSocket-Protocol` to the node so it can also read the subprotocol if needed.

### 3.4 Health endpoint

Simple HTTP health check:

```ts
app.get('/health', async () => {
  return { status: 'ok' };
});
```

Useful for monitoring, Kubernetes readiness probes, etc.

---

## 4. WebSocket usage on the frontend

### 4.1 Matchmaking client (`apps/frontend/src/services/matchmaking.ts`)

Client helper:

```ts
export function createMatchmakingClient(
  onMessage: (msg: MatchmakingMessage) => void,
  lifecycleHandlers: MatchmakingClientLifecycleHandlers = {},
) {
  const socket = new WebSocket(wsUrl('/matchmaking'));
  const pendingMessages: string[] = [];

  socket.addEventListener('message', (ev) => {
    try {
      onMessage(JSON.parse(ev.data) as MatchmakingMessage);
    } catch {
      // ignore malformed messages
    }
  });

  socket.addEventListener('open', () => {
    while (pendingMessages.length > 0 && socket.readyState === WebSocket.OPEN) {
      // flush queued messages
    }
    lifecycleHandlers.onOpen?.(event);
  });
  // onerror, onclose handlers...
```

Important details:

- Uses `wsUrl('/matchmaking')` to build the full WS URL (honors current origin and protocol).
- Buffers messages in `pendingMessages` if a send happens while `readyState` is `CONNECTING`.
- Provides a `safeSend` wrapper that:
  - Sends JSON when open.
  - Queues messages when connecting.
  - Drops messages when closed.

Public API:

- `joinQueue`, `leaveQueue`, `acceptMatch`, `declineMatch`, `confirmJoin`, etc.
- These send appropriate JSON payloads typed by `MatchmakingClientMessage`.

### 4.2 Realtime socket context (`apps/frontend/src/context/RealtimeSocketContext.tsx`)

This context manages a **separate WebSocket** for chat/presence:

```ts
const WS_URL = wsUrl('/chat');

export function RealtimeSocketProvider({ children }: RealtimeSocketProviderProps) {
  const { user } = useAppContext();
  const userUuid = user?.uuid ?? null;
  const username = user?.username ?? 'Player';

  const wsRef = useRef<WebSocket | null>(null);
  const messageHandlersRef = useRef<Set<(data: any) => void>>(new Set());
  const [readyState, setReadyState] = useState<number>(WebSocket.CONNECTING);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!userUuid) {
      wsRef.current?.close();
      wsRef.current = null;
      setIsConnected(false);
      setReadyState(WebSocket.CLOSED);
      return;
    }

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setReadyState(ws.readyState);
    };

    ws.onmessage = (ev) => {
      let data: any;
      try {
        data = JSON.parse(ev.data);
      } catch {
        // handle malformed
        return;
      }

      if (data.type === 'blockedList') {
        setIsConnected(true);
        ws.send(JSON.stringify({ type: 'setName', username }));
      }

      messageHandlersRef.current.forEach((handler) => handler(data));
    };

    ws.onerror = (err) => { /* update state, log */ };
    ws.onclose = () => { /* reset state, null wsRef */ };

    return () => {
      try {
        ws.close();
      } catch {}
    };
  }, [userUuid, username]);
```

This shows another real‑world pattern:

- Use `useEffect` to open/close the WebSocket when `userUuid` changes.
- Track `readyState` and `isConnected`.
- Provide a `send` function and a `subscribe` mechanism for child components.

### 4.3 Game WebSocket from the Pong side (conceptual)

The online Pong host in `@pong/render` (loaded via `useGameBootstrap`) creates the **game WebSocket**:

- Uses the `serverUrl` and `roomIdentifier` from the `HANDOFF` message.
- Attaches the join/resume token via `Sec-WebSocket-Protocol: bearer,<token>` or `resume,<token>`.
- Implements the game protocol defined in `packages/pong/shared/src/protocol/net.ts`:
  - Sends inputs.
  - Receives `FRAME` snapshots, `ROOM_STATE`, `START`, `MATCH_END`, etc.

The browser doesn’t connect directly to the game node; it always hits the **gateway** (`/g/:roomId`), which forwards to the correct node after verifying the token.

---

## 5. Security and robustness concerns

The gateway and WebSocket design address several important concerns:

### 5.1 Tokenized admission (no direct IDs)

- Clients **never** connect to game nodes using raw IDs stored in the browser.
- They always use **short‑lived tokens**:
  - Join tokens (from matchmaking/allocator).
  - Resume tokens (from game nodes).
- The gateway verifies these tokens offline and enforces single‑use join tokens.

This reduces:

- Risk of players joining someone else’s room by guessing IDs.
- Risk of reusing a token across multiple connections/devices.

### 5.2 Room→node mapping via Redis

- Gateway does not know game node placement logic; it just relies on:

  ```ts
  redis.get(`room-to-node:${roomId}`);
  ```

- Allocator/game nodes are responsible for:
  - Writing this mapping when rooms are created.
  - Cleaning it up when rooms are done.

This keeps the gateway **stateless** with respect to room placement; it can scale horizontally.

### 5.3 Retry & backoff for node connectivity

`proxyWithRetry`:

- Retries connections to game nodes when it encounters transient errors:

  ```ts
  const MAX_PROXY_RETRIES = 4;
  const INITIAL_RETRY_DELAY_MS = 100;
  const MAX_RETRY_DELAY_MS = 1000;
  ```

- Uses exponential backoff between retries.

This is important when nodes are:

- Warming up.
- Being restarted or scaled.

It reduces visible flakiness for players when nodes are temporarily unavailable.

### 5.4 Isolation of concerns

- **Matchmaking service**: pairing + tokens; no direct contact with game nodes.
- **Gateway**: admission + routing; no game logic.
- **Game nodes**: simulation + results; no knowledge of matchmaking queues.

This separation:

- Makes each component easier to reason about and test.
- Contains failures (e.g., a game node crash doesn’t take down matchmaking).

---

## 6. How to reason about and debug WebSocket issues

When something goes wrong in the online game, these are good steps:

1. **Matchmaking WS (`/matchmaking`)**:
   - Use browser DevTools → Network → WS to inspect messages.
   - Verify `CONNECTED`, `QUEUE_JOINED`, `MATCH_FOUND`, `HANDOFF` are arriving as expected.

2. **Gateway + game WS (`/g/:roomId`)**:
   - Check if the client is sending the correct `Sec-WebSocket-Protocol` header (join or resume).
   - Inspect gateway logs:
     - Unauthorized attempts.
     - Missing `Sec-WebSocket-Protocol`.
     - Missing `room-to-node` mapping.
     - Proxy failures and retries.

3. **Chat/realtime WS (`/chat`)**:
   - If chat presence is broken, inspect `RealtimeSocketContext` logs and WS frames for `/chat`.

4. **Redis**:
   - Ensure `room-to-node:` keys are being created and cleaned up.
   - Check join token keys (`join-token:`) for unexpected reuse or missing entries.

5. **Cross‑check tokens**:
   - Confirm that join/resume tokens have the right issuer/audience and room ID.
   - If `verifyJoinToken` or `verifyResumeToken` fails, inspect key configuration and token TTLs.

---

## 7. Summary

The gateway and WebSockets glue the browser, matchmaking, and game nodes into a coherent online experience:

- The **gateway**:
  - Validates join/resume tokens.
  - Looks up `roomId` → node in Redis.
  - Proxies WebSocket traffic with retries.

- The **browser**:
  - Uses WebSockets for matchmaking (`/matchmaking`) and chat (`/chat`).
  - Uses the gateway (`/g/:roomId`) to reach game nodes for actual Pong gameplay.

- The **protocols**:
  - Are all JSON‑based at the browser edge (matchmaking, chat).
  - Are type‑checked via shared TypeScript types (`protocol/net.ts`).

With this understanding, you can:

- Safely adjust gateway behavior (e.g., logging, retry logic, header handling).
- Add new WebSocket‑based features (new channels/protocols).
- Diagnose issues that span browser → gateway → game nodes.\*\*\*
