# Game Gateway – Overview (`apps/game-gateway`)

> Snapshot taken on 2025‑12‑11, based on the current implementation of the game gateway.

The game gateway terminates external WebSocket connections for `/g/:roomId` and forwards them to the correct game node (game-server instance). It enforces token validation and join token single‑use, but does not run the Pong simulation itself.

---

## 1. High‑Level Role & Runtime

- Purpose:
  - Accept incoming WS upgrades from browsers at `ws(s)://.../g/:roomId`.
  - Authenticate the connection using:
    - join tokens (for first connection to a room).
    - resume tokens (for reconnecting to an existing match).
  - Resolve which game node hosts `roomId` via Redis (`room-to-node:<roomId>`).
  - Proxy the WS connection to that node using `http-proxy`.

- Entry:
  - `apps/game-gateway/index.ts`:
    - Creates a Fastify app with logging + metrics.
    - Registers an `upgrade` handler on `app.server` that:
      - Parses the URL and protocols.
      - Validates tokens.
      - Looks up the game node in Redis.
      - Persists `join-token:<jti>` for single‑use joins.
      - Proxies the connection to the selected node with retry.
    - Exposes `GET /health` for liveness checks.

- Runtime:
  - Dev: launched via `docker-compose.yml` (service `game-gateway`, `pnpm dev`).
  - Prod: built with `node.template.dockerfile` and run as `node dist/index.js`.

---

## 2. Configuration (`config.ts`)

File: `apps/game-gateway/config.ts`

- Loads `.env` with `dotenv`.
- Requires:
  - `REDIS_PORT` – port of the Redis container (host is fixed to `redis`).
  - `GATEWAY_PORT` – port the gateway listens on (`PORT` in compose).
- Exports:
  - `REDIS_URL` – `redis://redis:${REDIS_PORT}`.
  - `PORT` – numeric listen port.

This keeps gateway config minimal and centralized.

---

## 3. WS Protocols and Tokens (`index.ts`)

File: `apps/game-gateway/index.ts`

- `parseProtocols(header)`:
  - Parses `Sec-WebSocket-Protocol` into a string array:
    - `"bearer,abc.def"` → `["bearer", "abc.def"]`.
    - `"resume,token"` → `["resume", "token"]`.
- `extractToken(protocols, tag)`:
  - Finds `tag` (e.g. `"bearer"`, `"resume"`) and returns the next entry as the token.

### 3.1 Join tokens

- `validateJoin(token, roomId)`:
  - Uses `verifyJoinToken` from `@pong/shared/auth/tokenSign`.
  - Ensures:
    - HMAC + expiry are valid.
    - `claims.roomIdentifier === roomId`.
    - `claims.iss === 'mm'` and `claims.aud === 'game-node'`.
- On a valid join:
  - The gateway marks the join token as **consumed** by setting:
    - key: `join-token:<jti>` (JTI claim from the token).
    - value: `roomId`.
    - options: `SET jtiKey roomId EX ttlSeconds NX`.
  - If `NX` fails (key already exists):
    - Gateway returns `4403 Forbidden` and closes the socket.

### 3.2 Resume tokens

- `validateResume(token, roomId)`:
  - Uses `verifyResumeToken`.
  - Ensures:
    - HMAC + expiry are valid.
    - `claims.roomIdentifier === roomId`.
    - `claims.iss === 'game-server'` and `claims.aud === 'game-server'`.
- Resume tokens are **single‑use** at the game node level (via `ResumeTokenService`) and are not persisted by the gateway; the gateway only validates them and routes the connection.

---

## 4. Routing and Proxying

### 4.1 Room → node resolution

- After token validation, the gateway looks up the hosting game node:
  - `gameNode = await redis.get("room-to-node:" + roomId)`.
  - If Redis errors or returns `null`:
    - Socket is destroyed (no node to route to).

The allocator / scorer are responsible for populating `room-to-node:<roomId>` in Redis; the gateway treats it as read‑only routing data.

### 4.2 `proxyWithRetry`

- Uses `http-proxy` to forward WS traffic:
  - `proxy.ws(req, socket, head, { target, headers: { 'sec-websocket-protocol': ... } }, cb)`
  - Preserves the `Sec-WebSocket-Protocol` header so downstream game servers receive the original subprotocols.
- Retry behavior:
  - Retries on `ECONNREFUSED` / `ECONNRESET` up to `MAX_PROXY_RETRIES` attempts.
  - Uses exponential backoff from `INITIAL_RETRY_DELAY_MS` up to `MAX_RETRY_DELAY_MS`.
  - Logs each retry attempt with target, attempt number, and next delay.
  - On other errors or the final failure, logs and throws, which leads to a `502`/`503` response on the socket.

---

## 5. Upgrade Flow

The `app.server.on('upgrade', ...)` handler is the core of the gateway.

Steps:

1. **Parse URL**
   - Accepts paths of the form `/g/:roomId`.
   - If not matched or `roomId` is missing → destroy socket.

2. **Read and parse `Sec-WebSocket-Protocol`**
   - If header missing or not a string:
     - Logs and returns `4401 Unauthorized`, then destroys the socket.

3. **Extract tokens**
   - `resumeToken` := token after `"resume"` if present.
   - If no resume token, `joinToken` := token after `"bearer"`.

4. **Validate tokens**
   - `resumeClaims` := `validateResume(resumeToken, roomId)` when resume token present.
   - `joinClaims` := `validateJoin(joinToken, roomId)` when no resumeClaims and join token present.
   - If both validations fail:
     - Logs and returns `4401 Unauthorized`, then destroys the socket.

5. **Resolve game node**
   - Reads `room-to-node:<roomId>` from Redis.
   - On error or null, destroys socket (no routing target).

6. **Join token single‑use (join path only)**
   - When `joinClaims` is present:
     - Computes TTL from token `exp`.
     - Writes `join-token:<jti>` with `SET ... EX ttlSeconds NX`.
     - If `NX` fails → `4403 Forbidden`, close.
     - On Redis error → `4500 Internal Server Error`, close.

7. **Proxy upgrade**
   - Calls `proxyWithRetry` with `target = gameNode`.
   - On success: logs `"Routed room {roomId} to {gameNode}"`.
   - On final failure:
     - Returns `503 Service Unavailable` or `502 Bad Gateway` and destroys the socket.

---

## 6. Health and Observability

- `GET /health`:
  - Returns `{ status: 'ok' }`.
  - Used by Docker/Kubernetes for liveness.

- Metrics:
  - `registerMetrics(app, { labels: { service: 'game-gateway' } })` attaches Prometheus metrics.
  - The scrape target is configured in the monitoring stack (see `docs/to0nsa/observability`).

Logs:

- Structured logs via `@utils/logger`:
  - Use `service: 'game-gateway'` for log routing.
  - Include `roomId`, `jti`, and `target` where helpful, but never log raw token values.

---

## 7. Testing

- Tests live under `apps/game-gateway/tests` and use Vitest:
  - `gateway.upgrade.test.ts`:
    - Mocks Fastify, Redis, and http-proxy.
    - Asserts behavior for invalid URLs, missing headers, invalid tokens, missing room mappings, reused join tokens, etc.
  - `gateway.resume.test.ts`:
    - Focuses on resume token behavior and routing when reconnecting.

If you change the upgrade flow, token validation, or Redis keys, update these tests and consider adding new ones for corner cases.
