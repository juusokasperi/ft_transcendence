# Allocator – Overview (`apps/allocator`)

> Snapshot taken on 2025‑12‑11, based on the current implementation of the allocator.

The allocator is a small HTTP service that chooses a game node for a match, creates a room on that node, and issues per‑player join tokens. It sits between matchmaking/backend and the game‑server + game‑gateway.

---

## 1. High‑Level Role & Runtime

- Responsibilities:
  - Accept `/allocate` requests from matchmaking or backend with:
    - `idempotencyKey`, `mode`, `players`, `randomSeed`, `simulationStartTick`, and optional `tournament` context.
  - Choose the “best” game node based on scores stored in Redis.
  - Ask that node to register a room via its `/admin/rooms` HTTP API.
  - Store `room-to-node:<roomIdentifier>` in Redis so the game gateway can route `/g/:roomId`.
  - Mint per‑player join tokens and return them to the caller.
  - Ensure the operation is idempotent via `idempotencyKey`.

- Entry:
  - `apps/allocator/index.ts`:
    - Creates a Fastify app.
    - Registers Prometheus metrics via `registerMetrics`.
    - Defines the `POST /allocate` route.
    - Starts listening on `PORT` from `utils/config.ts`.

---

## 2. Configuration (`utils/config.ts`)

File: `apps/allocator/utils/config.ts`

- Uses `dotenv.config()` to load `.env`.
- Requires:
  - `ALLOCATOR_PORT` – HTTP port to listen on.
  - `ADMIN_SECRET` – shared secret to call game-node admin endpoints.
  - `REDIS_URL` – Redis connection string.
- Exports:
  - `PORT` – numeric port for Fastify.
  - `REDIS_URL` – used to create a single `Redis` client in `index.ts`.
  - `IDEMPOTENCY_PREFIX` – `'allocator:idemp:'`, prefix for idempotency keys.
  - `ADMIN_SECRET` – forwarded as `X-Admin-Secret` header to game nodes.

---

## 3. Request Shape and Validation (`utils/schema.ts`)

File: `apps/allocator/utils/schema.ts`

- `AllocateSchema`:
  - JSON schema for `POST /allocate` request bodies:
    - `idempotencyKey: string` (UUID).
    - `mode: 'ranked' | 'tournament' | 'invite'`.
    - `players: Array<{ playerIdentifier, side, mmr, tournamentParticipantId?, alias? }>`:
      - `playerIdentifier` – UUID for each player.
      - `side` – `'west' | 'east'`.
      - `mmr` – numeric rating.
    - `simulationStartTick: number` – target simulation start time (epoch ms).
    - `randomSeed: integer` – seed for deterministic game setup.
    - `tournament` – object with:
      - `tournamentId`, `tournamentMatchId`, `tournamentStage`.
      - `participants: [{ participantId, userUuid, alias? }, ...]`.
- Used by Fastify’s schema validation to reject malformed requests before they hit allocation logic.

---

## 4. `/allocate` Flow (`index.ts`)

File: `apps/allocator/index.ts`

High‑level steps:

1. **Idempotency cache**
   - Reads `allocator:idemp:${idempotencyKey}` from Redis.
   - If present:
     - Logs an idempotency cache hit.
     - Returns the cached JSON response immediately.

2. **Create room identifier**
   - Generates `roomIdentifier = "r-" + uuid()`.
   - Sets `joinDeadlineAtEpochMs = Date.now() + 15_000` (15 seconds join window).

3. **Select game node**
   - Reads `game-node:scores` hash from Redis:
     - Values are JSON that include at least a `score` and `http`/`ws` endpoints.
   - Iterates over entries and picks the node with the lowest numeric `score`.
   - If no node has a valid score:
     - Logs “No available game nodes”.
     - Returns `503 { message: 'No available game nodes' }`.

4. **Register routing (`room-to-node`)**
   - Computes:
     - `nodeUrl = bestNodeInfo.http`.
     - `wsNodeUrl = bestNodeInfo.ws`.
   - Writes `room-to-node:${roomIdentifier}` with value `wsNodeUrl` and TTL 900 seconds.
   - This is what the game gateway uses to forward `/g/:roomId` to the correct node.

5. **Call game-node `/admin/rooms`**
   - Sends a POST to `${nodeUrl}/admin/rooms` with payload:
     - `idempotencyKey`, `roomIdentifier`, `capacity`, `expectedPlayers`, `randomSeed`, `simulationStartTick`, `joinDeadlineAtEpochMs`, `tournament`.
   - Uses header `X-Admin-Secret: ADMIN_SECRET` to authenticate.
   - On failure:
     - Logs “Failed to allocate a game server”.
     - Returns `503 { message: "Server's are busy." }`.

6. **Mint join tokens**
   - For each player in `players`:
     - Builds `JoinTokenClaims`:
       - `iss: 'mm'`, `aud: 'game-node'`.
       - `iat` (current time), `exp` (`nowSec + 60`).
       - `jti: uuid()`.
       - `roomIdentifier`, `sub` (playerIdentifier).
       - `side`, `simulationStartTick`.
       - For `mode === 'tournament'` with `tournament` provided:
         - Adds `tournamentId`, `tournamentMatchId`, `tournamentStage` to claims.
     - Signs using `signJoinToken` and stores in `perPlayerJoinTokens[playerIdentifier]`.

7. **Build response and cache**
   - Constructs:
     - `endpointUrl = "/g/" + roomIdentifier` (path the client will hit via the gateway).
     - Response:

       ```ts
       {
         roomIdentifier,
         endpointUrl,
         perPlayerJoinTokens,
       }
       ```

   - Logs “Allocated new room” with context (idempotencyKey, roomIdentifier, players, endpointUrl).
   - Caches response under `allocator:idemp:${idempotencyKey}` with TTL 300 seconds.
   - Sends response to caller.

8. **Error catch‑all**
   - Wraps the handler in a `try/catch`.
   - On unexpected errors:
     - Logs the error, idempotencyKey (if present), and request body.
     - Returns `500 { message: 'Internal server error' }`.

---

## 5. Metrics and Health

- Metrics:
  - `registerMetrics(app, { labels: { service: 'allocator' } })`:
    - Exposes Prometheus metrics at `/metrics` with default labels:
      - `service="allocator"`, plus env/version.
  - Additional, allocator‑specific metrics can be added via `prom-client` if needed.

- Health:
  - The allocator does not define a dedicated health route here.
  - If needed, a simple `GET /health` can be added, similar to other services, to respond `{ status: 'ok' }`.

---

## 6. Relationships to Other Services

- **Matchmaking / backend**:
  - Call `/allocate` to obtain:
    - `endpointUrl` for WebSocket (`/g/:roomId`).
    - `perPlayerJoinTokens` to pass down to the frontend.

- **Game gateway (`apps/game-gateway`)**:
  - Uses `room-to-node:<roomIdentifier>` to route `/g/:roomId` WS to the correct game node.
  - Validates join tokens using `JoinTokenClaims` shape and `iss/aud` conventions set here.

- **Game server (`apps/game-server`)**:
  - Receives `/admin/rooms` calls with `CreateRoomRequest` that this service builds.
  - Uses the join tokens minted here to authorize players joining the game node.

For more context on how this ties into the rest of the system, see:

- `docs/to0nsa/workflow/AllocatorAndScorer.md`
- `docs/to0nsa/redis/MatchmakingAndAllocator.md`
