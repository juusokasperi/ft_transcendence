# Game Server – Overview & Architecture (`apps/game-server`)

> Snapshot taken on 2025‑12‑11, based on the current implementation of the game server.

This document gives a high‑level overview of the game server codebase: how it is started, how the main pieces fit together, and where to look for specific responsibilities. For a deeper “code review” with risks and improvement ideas, see `review11-12-25.md`.

---

## 1. High‑Level Role & Runtime

- The game server is the authoritative **Pong simulation node**:
  - Runs the physics/rules via `@pong/game-logic`.
  - Owns the match loop (ticks, frames, pauses).
  - Maintains room reservations and active sessions.
  - Handles join/resume tokens, reconnects, forfeits.
  - Reports results to the backend API and exposes metrics.

- **Entry point**
  - `apps/game-server/index.ts`
    - Imports `GameServer` and calls:

      ```ts
      const server = new GameServer();
      await server.start();
      ```

    - This is the **only place** where `new GameServer()` is instantiated.

- **How it runs in different environments**
  - **Dev** (`docker-compose.yml`):
    - Service `game-server`:
      - `working_dir: /work/apps/game-server`
      - `command: ... pnpm dev` → `tsx index.ts`.
    - This executes `apps/game-server/index.ts`, which constructs and starts `GameServer`.
  - **Prod** (`docker-compose-prod.yml` + `node.template.dockerfile`):
    - Build args: `SERVICE_NAME=game-server`, `SERVICE_DIR=game-server`.
    - Builder runs `pnpm build:vite` and `pnpm --filter @app/game-server deploy`.
    - Runtime stage:
      - `CMD ["node", "dist/index.js"]`.
      - `dist/index.js` is the compiled version of `apps/game-server/index.ts`, again creating `GameServer`.

So conceptually: *“Docker (dev or prod) starts Node → Node runs `index.ts` → `GameServer` composes everything else.”*

---

## 2. Configuration & Time Abstractions

### 2.1 `Config.ts`

File: `apps/game-server/src/app/Config.ts`

- Loads environment variables (via `dotenv`) and builds a typed `AppConfig`:
  - `httpPort`, `wsPort` – HTTP admin/health and WebSocket ports.
  - `adminSecret` – protects `/admin/rooms` HTTP endpoint.
  - `redisUrl` – Redis connection (resume tokens, rate limiting, etc.).
  - `apiUrl` – backend API base URL, used by `ResultReporter`.
  - `matchSecret` – secret to sign internal match service JWTs.
  - `tickHz` – simulation tick rate.
  - `minStartDelayMs` – buffer between join and match start.
  - `lagCompensationMs` – time window used by TickEngine for lag compensation.
  - `reconnectGraceMs` – `{ casualMs, tournamentMs }`, used by `Policies.reconnectGraceMs`.

- `loadConfig()` is called exactly once in `GameServer`’s constructor and the `AppConfig` is passed down to:
  - `WSServer` (for `wsPort`, reconnect grace).
  - `Broadcaster` and `MatchRunner` (for `tickHz`, `minStartDelayMs`, `lagCompensationMs`).
  - `ResultReporter` (for `apiUrl`, `matchSecret`).
  - HTTP infra (for `httpPort`, `adminSecret`).

### 2.2 `Time.ts`

File: `apps/game-server/src/app/Time.ts`

- Defines:
  - `Clock` – `now(): number` (ms since epoch).
  - `Scheduler` – abstractions over `setInterval` / `setTimeout` returning **cancel functions**.
- Implementations:
  - `systemClock()` – uses `Date.now()` (wall‑clock) on purpose, to align with tokens, DB rows, logs.
  - `nodeScheduler()` – wraps Node timers and returns cancel callbacks.

These are injected into `GameServer` and then passed into `MatchRunner` and `ReconnectManager`, making time control easier in tests.

### 2.3 `RedisFactory.ts`

File: `apps/game-server/src/app/RedisFactory.ts`

- Small DI wrapper around `ioredis`:
  - `createRedisFactory(url).create()` → `Redis` instance.
- Used by `GameServer` to create a single shared Redis client, and makes tests easier by allowing a fake factory.

---

## 3. Core Domain Types & Model

### 3.1 `MatchTypes.ts`

File: `apps/game-server/src/domain/MatchTypes.ts`

- Core types:
  - `Seat` – `'P1' | 'P2'` (logical player index in the model).
  - `TableSide` – `'east' | 'west'` (physical side of the table, used in protocol).
  - `ExpectedPlayer` – per‑player reservation metadata:
    - `playerIdentifier` (user UUID), `side`, `seat`, `joined` flag, optional `participantId`, `alias`, and `mmr`.
  - `TournamentReservation` – links a room to tournament context (tournament id/match id/stage and participant list).
  - `RoomReservation` – immutable reservation:
    - `roomIdentifier`, `idempotencyKey`, `capacity`, `joinDeadlineAtEpochMs`.
    - `randomSeed`, `simulationStartTick`.
    - `expectedPlayers: Map<string, ExpectedPlayer>`.
    - `consumedJtis: Set<string>` to enforce join/resume token single‑use.
    - Optional `tournament` context.
  - `PlayerSession` – minimal snapshot of a player used for reporting/logging.

### 3.2 `RoomReservation.ts`

File: `apps/game-server/src/domain/RoomReservation.ts`

- `CreateRoomRequest` – shape of JSON body coming from allocator/backend `/admin/rooms`.
- `seatForSide(side)` – maps `'east' | 'west'` → `'P1' | 'P2'`.
- `createRoomReservation(payload)`:
  - Validates basic invariants.
  - Derives `randomSeed`, `simulationStartTick`, `joinDeadlineAtEpochMs` with defaults.
  - Builds `expectedPlayers` as a `Map<string, ExpectedPlayer>` keyed by `playerIdentifier`.
  - Initializes `consumedJtis` and attaches optional `tournament` context.
- `resolveRoomState(started, playersReady)` – helper for ROOM_STATE messages.

### 3.3 `MatchModel.ts`

File: `apps/game-server/src/domain/MatchModel.ts`

- Wraps the `@pong/game-logic` controller and holds game lifecycle state:
  - `reservation`, `controller`, `state`, `tick`, `lastEvents`, `lastSnapshot`.
  - Flags: `started`, `startAtEpochMs`, `resultSubmitting`, `resultSubmitted`, `disconnectGrace`.
  - Loop control: `loopCancel`, `loopActive`, `startTimeoutCancel`.
- Methods:
  - `create(reservation)` – builds bounds/rules, picks initial server, creates controller.
  - `applyStep` – updates state/events/snapshot.
  - `setLoopCancel`/`cancelLoop`, `setStartTimeout`/`clearStartTimeout`.
  - `markStart`/`markStopped`.
  - `startDisconnectGrace`/`cancelDisconnectGrace`.

### 3.4 `PauseQuantizer.ts` and `Policies.ts`

Files:

- `apps/game-server/src/domain/PauseQuantizer.ts`
- `apps/game-server/src/domain/Policies.ts`

- `PauseQuantizer`:
  - `gridMs(tickHz)` – duration of a single tick in ms.
  - `quantizeMs(ms, tickHz)` – clamp to `>= 0` and round **up** to the next tick multiple.
- `Policies`:
  - `reconnectGraceMs(isTournament, cfg)` – picks `casualMs` or `tournamentMs` from config.
  - `seatToSide(playerAtEnd, seat)` – maps `'P1'/'P2'` → `'east'/'west'` using final mapping with a safe fallback.

### 3.5 `TickEngine.ts`

File: `apps/game-server/src/domain/TickEngine.ts`

- `stepOnce` is the stateless glue between `@pong/game-logic` and the server:
  - Applies `stepPaddles` and `handleSteps`.
  - Quantizes pause timers when entering pause phases.
  - Runs `controller.afterPhysicsStep`.
  - Returns `{ state, events, snapshot }` for broadcasting and reporting.
- Called from `MatchRunner.tick()` on every simulation tick.

---

## 4. Application Layer (Services)

### 4.1 `RoomRegistry.ts`

File: `apps/game-server/src/app/RoomRegistry.ts`

- Types:
  - `PlayerConnectionState` – in‑memory details for a connected player.
  - `MatchSession` – `{ reservation, model, players }`.
- `RoomRegistry` owns:
  - All registered room reservations (from `/admin/rooms`).
  - All active `MatchSession`s.
- Key methods:
  - `registerRoom`, `getReservation`.
  - `ensureSession`.
  - `attachPlayer`, `detachPlayer`, `updateAxis`.
  - `clearSession`, `getSession`.
  - `metrics()` for Prometheus gauges.

### 4.2 `Broadcaster.ts`

File: `apps/game-server/src/app/Broadcaster.ts`

Sends all **server → client** messages on the game WebSocket:

- `ROOM_STATE`, `START`.
- `FRAME` (state + events + snapshot + tick + opponent axis).
- `RESUME_TOKEN`.
- `MATCH_END`.
- `OPPONENT_DISCONNECTED` / `OPPONENT_RECONNECTED`.

### 4.3 `AuthService.ts`

File: `apps/game-server/src/app/AuthService.ts`

- Wraps `verifyJoinToken` and enforces:
  - Valid signature/expiry.
  - Matching `roomIdentifier`.
  - `iss === 'mm'` and `aud === 'game-node'`.
- Used by `WSServer` for join validation.

### 4.4 `ResumeTokenService.ts`

File: `apps/game-server/src/app/ResumeTokenService.ts`

- Issues and consumes **single‑use resume tokens**:
  - Persists `resume-token:<jti>` in Redis with `EX` and `NX`.
  - Ensures tokens are scoped to room, player, and `sessionIdentifier`.
- Used by `WSServer` when rotating resume tokens.

### 4.5 `ReconnectManager.ts`

File: `apps/game-server/src/app/ReconnectManager.ts`

Coordinates behavior when players disconnect or reconnect:

- On disconnect:
  - Handles “both absent”, “not started yet”, and “started” cases.
  - Applies a reconnect grace window and may auto‑award a timeout win.
- On reconnect:
  - Cancels grace.
  - Reschedules start if pre‑match.
  - Notifies opponent and resumes the loop if match already started.

### 4.6 `ResultReporter.ts`

File: `apps/game-server/src/app/ResultReporter.ts`

Turns a finished match session into:

- Backend API calls:
  - Tournament: report winner/loser participant IDs and per‑game history.
  - Casual: create match, update MMR/ELO, and post per‑player stats.
- `OnlineMatchSummary` for the frontend.

Handles:

- Player resolution (east/west vs P1/P2).
- Technical wins (disconnect/forfeit/timeout).
- Best‑of derivation and games history construction.

### 4.7 `MatchRunner.ts`

File: `apps/game-server/src/app/MatchRunner.ts`

Owns the authoritative tick loop:

- `scheduleStart` – computes start time and schedules `startMatch`.
- `startMatch` – validates presence of both players, initializes state, starts loop.
- `resume` / `stop` – control the loop for reconnects or finalization.
- `tick` – one simulation step: read intents, call `stepOnce`, update model, send `FRAME`, detect match‑over.
- `handleMatchOver` – stop, report, send `MATCH_END`, and call `onCompleted`.

### 4.8 `GameServer.ts`

File: `apps/game-server/src/app/GameServer.ts`

Composition root:

- Wires together:
  - `AppConfig`, `Clock`, `Scheduler`, `Redis`.
  - `RoomRegistry`, `Broadcaster`, `ResultReporter`.
  - `MatchRunner`, `ResumeTokenService`, `ReconnectManager`, `WSServer`.
  - HTTP server via `createHttpServer`.
- `start()`:
  - Starts the WebSocket server and logs startup complete.

---

## 5. Infra Layer – HTTP & WebSocket

### 5.1 HTTP: `infra/http/index.ts`

File: `apps/game-server/src/infra/http/index.ts`

- `createHttpServer({ adminSecret, port, registry, onCreateRoom })`:
  - Configures Fastify with structured logging and Prometheus metrics.
  - Registers dynamic gauges from `registry.metrics()`.
  - Adds:
    - `GET /health` – simple liveness probe.
    - `POST /admin/rooms` – admin endpoint for room creation, guarded by `x-admin-secret`.

### 5.2 WebSocket: `infra/ws/WSServer.ts`

File: `apps/game-server/src/infra/ws/WSServer.ts`

- Exposes `/g/:roomId` WS endpoint.
- Parses `Sec-WebSocket-Protocol` to distinguish `bearer` (join) vs `resume` (reconnect).
- Validates tokens (`AuthService`, `ResumeTokenService`) and uses Redis for:
  - Join token single‑use (`join-token:<jti>` written by gateway).
  - Rate limiting via `RedisTokenBucket`.
- Uses `RoomRegistry` to attach/detach players and keep track of sessions.
- Uses `MatchRunner`, `ReconnectManager`, and `ResultReporter` to:
  - Start/resume matches.
  - Handle explicit forfeits, disconnects, and timeouts.
  - Produce and broadcast final results.

---

## 6. Testing Coverage

Tests are under `apps/game-server/tests` and use Vitest:

- `resume-token.service.test.ts`:
  - Tests `ResumeTokenService.issue`/`consume` with a fake in‑memory Redis:
    - Single‑use semantics (first consume works, second returns `null`).
    - Handling NX failures when persisting tokens.
    - Rejecting tokens with invalid `iss`/`aud`.

- `httpServer.test.ts`:
  - Mocks Fastify to test `createHttpServer`:
    - `GET /health` returns `{ status: 'ok' }`.
    - `/metrics` uses registry metrics and exposes Prometheus payload with game server gauges.
    - `/admin/rooms` is guarded by `x-admin-secret` and forwards to `onCreateRoom`.
    - Error handling maps thrown errors to `400 { error }`.

- `wss.rotation.test.ts`:
  - Focuses on `WSServer`’s resume-token rotation logic:
    - Ensures issued tokens use TTL `graceMs + rotatePeriod`.
    - Ensures the interval delay equals computed `rotatePeriod`.
    - Asserts that replacing a connection updates the interval, and only the **latest connection’s** close clears the active interval.

These tests don’t cover the full game flow (join, play, disconnect, report), but they validate some of the trickiest infrastructure pieces.
