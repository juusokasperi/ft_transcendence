# Matchmaking – Overview (`apps/matchmaking`)

> Snapshot taken on 2025‑12‑12, based on the current implementation of the matchmaking service.

The matchmaking service is the browser‑facing control plane for online Pong. It authenticates players, pairs them (ranked queue or invites), orchestrates tournament participation and scheduled matches, and hands matched players off to a game node via the allocator.

For end‑to‑end network/user flows, see:

- `docs/to0nsa/workflow/MatchmakingService.md`
- `docs/to0nsa/tournament/*`

---

## 1. High‑Level Role & Runtime

- Responsibilities:
  - Accept WebSocket connections from browsers at `/matchmaking`.
  - Authenticate each connection using the site JWT cookie (`token`) shared with the backend.
  - Maintain an in‑memory state machine for each connected client (queue / tournament / invite / handoff).
  - Run ranked matchmaking by MMR buckets and send match offers (`MATCH_FOUND`, accept/decline).
  - Coordinate invite‑only matches created from chat (`/invite-match` → lobby → handoff).
  - React to tournament events from Redis Streams and backend APIs:
    - invite scheduled matches (`TOURNAMENT_MATCHES_READY`)
    - countdown/auto‑start and absence auto‑wins
    - lobby/bracket snapshot broadcasts.
  - Request room allocations from `apps/allocator` and send `HANDOFF` messages to clients.
  - Track “pending handoffs” and requeue/restore when players fail to join a game node.

- State model:
  - Ranked queue, pending match offers, invite lobbies, and countdown timers are held
    **in memory only**. A matchmaking restart clears them; the system recovers via
    client reconnects and backend/Redis tournament sources of truth.

- Entry:
  - `apps/matchmaking/index.ts`:
    - Creates a Fastify app with `@fastify/websocket`.
    - Registers:
      - `GET /matchmaking` (WS)
      - `POST /invite-match` (HTTP plugin from `utils/invites.ts`)
      - `GET /health`
    - Creates Redis connections and starts `MatchmakingRedisBridge`.
    - Starts a periodic `tryMatchQueue` tick every 500ms.
    - Listens on `MATCHMAKING_PORT`.

- Runtime environments:
  - Dev (`docker-compose.yml`):
    - Service `matchmaking-service` runs `pnpm dev` from `/work/apps/matchmaking`,
      which executes `tsx index.ts`.
  - Prod (`docker-compose-prod.yml` + `node.template.dockerfile`):
    - Built with `SERVICE_NAME=matchmaking`, runtime command `node dist/index.js`,
      the compiled entrypoint.

---

## 2. Configuration (`utils/config.ts`)

File: `apps/matchmaking/utils/config.ts`

- Loads `.env` via `dotenv.config()` and validates required vars:
  - `MATCHMAKING_PORT` – Fastify/WS listen port.
  - `SECRET` – JWT secret to verify site tokens (same as backend).
  - `API_URL` – backend HTTP API base URL.
  - `ALLOCATOR_PORT` – allocator port; used to build `ALLOCATOR_URL=http://allocator:<port>`.
  - `REDIS_PORT` – shared Redis port; used to build `REDIS_URL=redis://redis:<port>`.
  - `MATCH_SECRET` – secret to mint short‑lived “matchmaking service” JWTs for backend tournament automation.

- Exports service tuning knobs:
  - `LOBBY_TTL_MS`, `LOBBY_SIZE` – invite lobby lifetime/size.
  - `JOIN_TOKEN_TTL_SECONDS` – join token TTL returned to clients.
  - Tournament scheduling:
    - `TOURNAMENT_MATCH_AUTO_START_DELAY_MS`
    - `TOURNAMENT_MATCH_COUNTDOWN_INTERVAL_MS`
    - `TOURNAMENT_REMINDER_DELAY_MS`
    - `TOURNAMENT_MAX_REMINDERS`
    - `TOURNAMENT_ABSENCE_AUTO_WIN_MS`

---

## 3. Client Model & WS Interface

### 3.1 Authentication

File: `apps/matchmaking/auth/auth.ts`

- On WS upgrade, `extractToken(...)` reads the `token=` cookie and rejects the connection if absent.
- `handleAuth(...)`:
  1. Verifies the site JWT (`verifySiteToken`) to get `{ uuid, username }`.
  2. Ensures single active connection per user by closing any previous socket for the same UUID.
  3. Fetches the user’s current MMR from backend (`GET /api/users/:uuid`).
  4. Populates the `ClientInfo` and marks it authenticated.

### 3.2 In‑memory client state

File: `apps/matchmaking/types/types.ts`

- Each connected client is represented as `ClientInfo` and tracked in a `Map<clientId, ClientInfo>`.
- `ClientState` is a small state machine used to gate WS messages:
  - `IDLE` → not in queue/tournament/invite.
  - `IN_QUEUE` → ranked queue.
  - `PENDING_MATCH_ACCEPTANCE` → received `MATCH_FOUND`.
  - `AWAITING_HANDOFF` / `HANDOFF_TO_GAME` → accepted and waiting to connect to game node.
  - `IN_INVITE_LOBBY` → waiting for invite opponent.
  - `IN_TOURNAMENT` → tournament lobby + scheduled matches.

State transitions are centralized in `utils/state.ts` for consistent logging.

### 3.3 Primary WS messages

The shared protocol lives in `packages/pong/shared/src/protocol/net.ts`. Matchmaking mostly sends/receives:

- Queue:
  - Client → server: `JOIN_QUEUE`, `CONFIRM_JOIN`, `LEAVE_QUEUE`, `ACCEPT_MATCH`, `DECLINE_MATCH`.
  - Server → client: `QUEUE_JOINED`, `QUEUE_LEFT`, `MATCH_FOUND`, `MATCH_DECLINED`, `MATCH_TIMEOUT`.
- Handoff:
  - Server → client: `HANDOFF`, `HANDOFF_TIMEOUT`, `ERROR`.
- Tournament:
  - Client → server: `CREATE_TOURNAMENT`, `JOIN_TOURNAMENT`, `LEAVE_TOURNAMENT`, `FORFEIT_TOURNAMENT`, `ACCEPT_SCHEDULED`.
  - Server → client: `TOURNAMENT_LOBBY_UPDATED`, `TOURNAMENT_BRACKET_SNAPSHOT`,
    `TOURNAMENT_MATCHES_READY`, `TOURNAMENT_MATCH_COUNTDOWN`.

---

## 4. Ranked Queue Matching (`utils/queue.ts`)

File: `apps/matchmaking/utils/queue.ts`

- Players enter the queue via `handleJoinQueue(...)` and are inserted into MMR buckets:
  - bucket key = `floor(mmr / 50)`.
  - within a bucket, the oldest player is at index 0.

- `tryMatchQueue(pendingMatches)` runs every 500ms:
  1. Collects the oldest player from each non‑empty bucket.
  2. Sorts those candidates by `joinedAt`.
  3. For each candidate `a`, searches neighboring buckets within a dynamic MMR window:
     - window starts at 50 and widens as `a` waits (capped at 500).
  4. On first eligible opponent `b`, removes both from buckets and creates a `PendingMatch`.

- `addToPendingMatches(a, b, pendingMatches)`:
  - Sends `MATCH_FOUND` to both players with opponent info.
  - Starts a 15s accept window.
  - If both accept, calls `createMatch(..., 'ranked')`.
  - If one declines or times out, the other is returned to queue fairly (`returnToQueue`).

This bucket + widening‑window strategy reduces starvation without over‑matching distant MMRs.

---

## 5. Allocation & Handoff (`utils/queue.ts`, `utils/pendingHandoffs.ts`)

- `createMatch(a, b, mode, options)` is the shared allocator handoff helper:
  1. Generates `matchId` (also used as allocator idempotency key).
  2. Computes:
     - `randomSeed` for deterministic simulation.
     - `simulationStartTick = Date.now() + 5000` (epoch‑based start time).
  3. Calls allocator `POST /allocate` with:
     - players (uuid, side, alias, mmr)
     - randomSeed, simulationStartTick
     - optional tournament context.
  4. On success, sends each client a `HANDOFF` containing:
     - `roomIdentifier`, `gameServerWSUrl` (`/g/:roomId` via gateway)
     - per‑player join token + TTL
     - randomSeed, simulationStartTick, tournament context.

- `handleHandoff(player, roomIdentifier, mode)` in `utils/pendingHandoffs.ts`:
  - Starts a 15s timer per player to ensure they connect to the game node.
  - If the timer elapses:
    - ranked → requeue via `handleJoinQueue`
    - invite → return to idle
    - tournament → return to tournament state and let reminders/absence logic handle it.
  - When the game node publishes `room_ready` to Redis, `handleAdmitConfirmed` clears timers and closes the matchmaking sockets.

---

## 6. Invite‑Based Matches (`utils/invites.ts`)

File: `apps/matchmaking/utils/invites.ts`

- Backend/chat starts invites by calling `POST /invite-match` with `{ player1Uuid, player2Uuid }`.
- Matchmaking creates an in‑memory lobby (`InviteLobby`) and indexes it by lobbyId and player UUID.
- When either player connects to `/matchmaking`, `isInLobby` routes them into the invite flow:
  - `handleInviteLobbyJoin` attaches the client to the lobby.
  - Once both are present and not in tournaments, matchmaking calls `createMatch(..., 'invite')`.
- Lobbies are best‑effort and process‑local (no Redis persistence); if a player doesn’t join within the lobby TTL, the lobby is destroyed.

---

## 7. Tournament Orchestration (`utils/scheduledMatches.ts`)

File: `apps/matchmaking/utils/scheduledMatches.ts`

- Tournament membership actions:
  - `handleCreateTournament`, `handleJoinTournament`, `handleLeaveTournament`, `handleForfeitTournament`
  - Call backend REST APIs, then broadcast fresh snapshots.
  - Mirror active memberships in `tournamentMembershipRegistry.ts` to block invites.

- Redis stream integration:
  - `MatchmakingRedisBridge` consumes:
    - `STREAM_TOURNAMENT_MATCHES_READY` → `handleTournamentMatchesReady`
    - `STREAM_TOURNAMENT_STATE_UPDATED` → `handleTournamentStateUpdated`

- Scheduled match flow:
  1. For each ready match, `handleSingleTournamentMatch` creates/refreshes a `PendingTournamentMatch`.
  2. If both players are online:
     - sends `TOURNAMENT_MATCHES_READY`
     - starts a countdown emitting `TOURNAMENT_MATCH_COUNTDOWN` ticks.
  3. At countdown expiry:
     - if both still present → `createMatch(..., 'tournament')`
     - if one missing → cancels countdown, schedules reminders, and may schedule an absence auto‑win.
  4. Reminders re‑run the same availability check up to `TOURNAMENT_MAX_REMINDERS`.
  5. Absence auto‑win uses a short‑lived service token to call backend `auto-forfeit`, then triggers a state sync.

- Reconnects:
  - On WS connect, `restoreTournamentMembership` queries backend for active membership,
    re‑subscribes the user, and replays pending matches/countdowns if any.

---

## 8. Redis Usage & Inter‑Service Interaction

- Redis keys/channels used by matchmaking:
  - Pub/sub:
    - `room_ready` – published by game servers when both players joined a room.
  - Streams:
    - `STREAM_TOURNAMENT_MATCHES_READY`
    - `STREAM_TOURNAMENT_STATE_UPDATED`
  - Rate limiting:
    - `RedisTokenBucket(redis, 'mm:rl')` stores per‑client token buckets.

- Other services:
  - **Backend (`apps/backend`)**
    - Site token verification secret (`SECRET`).
    - MMR lookup (`/api/users/:uuid`).
    - Tournament persistence and bracket APIs.
  - **Allocator (`apps/allocator`)**
    - Receives `POST /allocate` and returns room + join tokens.
  - **Game gateway (`apps/game-gateway`)**
    - Terminates `/g/:roomId` WS and validates join/resume tokens.
  - **Game servers (`apps/game-server`)**
    - Publish `room_ready` and run the authoritative simulation.
  - **Chat / invites**
    - Initiate invite matches via `POST /invite-match`.

---

## 9. Health, Metrics, and Tests

- `GET /health` → `{ status: 'ok' }` for liveness.
- Prometheus metrics:
  - `registerMetrics(app, { labels: { service: 'matchmaking' } })` exposes `/metrics`.
- Tests:
  - Vitest under `apps/matchmaking/tests`:
    - `tournamentBridge.test.ts` and `tournamentScheduling.test.ts` cover tournament orchestration.
