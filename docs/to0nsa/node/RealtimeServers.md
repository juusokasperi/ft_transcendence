# Realtime Servers – Matchmaking, Chat, Gateway, and Game Server WS

This document describes how **Node + Fastify are used for realtime services**:

- Matchmaking (`apps/matchmaking`)
- Chat (`apps/chat`)
- Game gateway (`apps/game-gateway`)
- Game server WebSocket server (`apps/game-server/src/infra/ws/WSServer.ts`)

For protocol and workflow details, see:

- `docs/to0nsa/workflow/MatchmakingService.md`
- `docs/to0nsa/workflow/ChatAndPresence.md`
- `docs/to0nsa/workflow/GatewayAndWebSockets.md`
- `docs/to0nsa/workflow/GameNode.md`

Here, we focus on **how the servers are built** with Node/Fastify.

---

## 1. Matchmaking service (`apps/matchmaking`)

**File:** `apps/matchmaking/index.ts`

Fastify setup:

```ts
const app = Fastify({
  logger: createFastifyLoggerConfig({ service: 'matchmaking' }),
});

registerMetrics(app, { labels: { service: 'matchmaking' } });

await app.register(websocket);
```

WebSocket route:

```ts
app.get('/matchmaking', { websocket: true }, (socket: WebSocket, req) => {
  void handleConnection(socket, req);
});
```

Key patterns:

- `handleConnection`:
  - Extracts site auth token from cookies/headers.
  - Authenticates users and stores them in an in‑memory `clients` map.
  - Attaches `message` and `close` listeners on the raw `ws` socket.
- Redis integration:
  - Redis connections created here are used for rate limiting, queues, and tournament streams (see Redis docs).
- Health:

  ```ts
  app.get('/health', async () => ({ status: 'ok' }));
  ```

Matchmaking uses Fastify primarily as:

- A container for logging, metrics, and lifecycle management.
- A way to expose one WebSocket route (`/matchmaking`) and one health endpoint.

---

## 2. Chat service (`apps/chat`)

**File:** `apps/chat/index.ts`

Fastify setup:

```ts
const fastify = Fastify({
  logger: createFastifyLoggerConfig({ service: 'chat' }),
});

registerMetrics(fastify, { labels: { service: 'chat' } });
await fastify.register(websocket);
```

WebSocket route:

```ts
fastify.get('/chat', { websocket: true }, (connection, request) =>
  handleConnection(connection, request, clients, pendingInvites, fastify.log),
);
```

Key patterns:

- Maintains:
  - `clients: Map<string, Client>` – connected users.
  - `pendingInvites: Map<string, PendingInvite>` – invite‑based matchmaking.
- Uses shared `handleConnection` to:
  - Authenticate users using the site token.
  - Attach message handlers for chat, presence, and invites.
- Uses `setInterval` for invite cleanup:

  ```ts
  setInterval(() => cleanupExpiredInvites(pendingInvites, clients, fastify.log), 10000);
  ```

- Exposes `/health` and `/metrics` via Fastify.

Here, Fastify again is a lightweight container for WS + HTTP endpoints, with all logic handled in plain `ws` message handlers.

---

## 3. Game gateway (`apps/game-gateway`)

**File:** `apps/game-gateway/index.ts`

Fastify setup:

```ts
const app = fastify({
  logger: createFastifyLoggerConfig({ service: 'game-gateway' }),
});

registerMetrics(app, { labels: { service: 'game-gateway' } });
```

Note: the gateway does **not** register `@fastify/websocket`. Instead, it listens to Node’s `upgrade` event directly:

```ts
app.server.on('upgrade', async (req, socket, head) => {
  // Parse URL /g/:roomId, validate tokens, look up Redis, then proxy
});
```

Using `http-proxy`:

```ts
const proxy = new createProxyServer({ ws: true });
// ...
proxy.ws(req, socket, head, { target, headers: { 'sec-websocket-protocol': ... } }, callback);
```

Why:

- The gateway acts as a **reverse proxy** rather than terminating the WebSocket.
- It validates join/resume tokens, consults Redis for room routing, and then forwards the raw WS connection to the game node.

It still exposes:

- `/health` – for Kubernetes/docker health checks.
- `/metrics` – via `registerMetrics`.

---

## 4. Game server WebSocket server (`WSServer`)

**File:** `apps/game-server/src/infra/ws/WSServer.ts`

Unlike matchmaking/chat, the game server wraps Fastify inside a `WSServer` class:

```ts
this.app = fastify({ logger: true });

async init(): Promise<void> {
  await this.app.register(websocket);
  this.registerRoutes();
}

async listen(): Promise<void> {
  await this.init();
  await this.app.listen({ port: this.config.wsPort, host: '0.0.0.0' });
}
```

WebSocket route:

```ts
this.app.register((fastify) => {
  fastify.get('/g/:roomId', { websocket: true }, async (connection, req) => {
    await this.handleConnection(connection, req.params as { roomId: string }, req.headers);
  });
});
```

Inside `handleConnection`:

- Parses `Sec-WebSocket-Protocol` to detect join vs resume tokens.
- Calls:
  - `handleJoinConnection(connection, roomIdentifier, joinToken)` or
  - `handleResumeConnection(connection, roomIdentifier, resumeToken)`.
- Binds sockets to sessions, sets up message handlers, and installs per‑player rate limiting.

Integration with the rest of the app:

- `GameServer` (`apps/game-server/src/app/GameServer.ts`) creates:
  - `RoomRegistry`, `Broadcaster`, `MatchRunner`, `ResumeTokenService`, `ReconnectManager`.
  - Injects them into `WSServer`.
- `WSServer` uses these to:
  - Update axis input.
  - Broadcast frames and state.
  - Manage reconnect windows and resume tokens.

Fastify’s role here:

- Provide the basic HTTP server and `@fastify/websocket` integration.
- Log WS connections and expose `/metrics` via the shared metrics plugin (registered at the app level, not shown in this file).

---

## 5. Health and metrics across realtime services

All realtime services follow the same pattern:

- `registerMetrics(app, { labels: { service: 'matchmaking' | 'chat' | 'game-gateway' | 'game-server' } });`
- `app.get('/health', async () => ({ status: 'ok' }));`

This makes them:

- **Easy to monitor** via Prometheus and Grafana.
- **Easy to health‑check** in Docker/Kubernetes.

When adding a new realtime service:

- Use the same Fastify + `@fastify/websocket` setup.
- Add `/health` and `/metrics`.
- Use `createFastifyLoggerConfig` for consistent log formats.
