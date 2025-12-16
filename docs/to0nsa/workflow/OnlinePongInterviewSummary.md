# Online Pong – Interview‑Style Workflow Summary

This is a **compact but thorough summary** of how online Pong works in this project, aimed at explaining the system in an interview.

It covers:

- Overall architecture.
- Control plane (matchmaking → allocator → game node → gateway).
- Data plane (ticks, frames, latency).
- Tokens and security.
- Reconnect/resume behavior.
- Invites and tournaments at a high level.

TL;DR happy path:

1. User opens `/pong/online` → WS to `/matchmaking`.
2. `JOIN_QUEUE` → `MATCH_FOUND` → both `ACCEPT_MATCH`.
3. Matchmaking calls allocator `/allocate` → receives room + join tokens.
4. Matchmaking sends `HANDOFF` → clients connect to `/g/:roomId` through gateway.
5. Game node runs ticks and streams `FRAME`s → ends with `MATCH_END` and reports results.

---

## 1. High‑level architecture

**Goal:** server‑authoritative Pong with matchmaking, invites, and tournaments, running across multiple Node services.

Key components:

- **Frontend** (`apps/frontend`):
  - React/Vite app.
  - Uses:
    - HTTP (`/api/*`) for auth, profile, stats, tournaments.
    - WebSockets:
      - `/matchmaking` for queues, invites, tournaments.
      - `/chat` for chat/presence.
      - `/g/:roomId` (via gateway) for game traffic.

- **Backend API** (`apps/backend`):
  - Auth (login/signup, JWT cookies, refresh).
  - User/friends/blocked users.
  - Matches and stats.
  - Tournaments and brackets.

- **Matchmaking** (`apps/matchmaking`):
  - WebSocket `/matchmaking`.
  - Queues and pairs players for ranked.
  - Coordinates invite lobbies and tournaments.
  - Talks to allocator and backend.

- **Allocator & Scorer** (`apps/allocator`, `apps/scorer`):
  - Scorer reads metrics and ranks game nodes.
  - Allocator:
    - Chooses a game node.
    - Creates a room on that node.
    - Mints join tokens for each player.

- **Game Node & Gateway** (`apps/game-server`, `apps/game-gateway`):
  - Game node:
    - Runs the server‑authoritative Pong simulation.
    - Issues resume tokens for reconnect.
    - Reports results to backend.
  - Gateway:
    - Entry point `/g/:roomId`.
    - Validates join/resume tokens.
    - Proxies WebSockets to the correct game node.

- **Redis, Nginx, Docker, Observability**:
  - Redis: room routing (`room-to-node:*`), join/resume single‑use registries (`join-token:*`, `resume-token:*`), tournament streams + `room_ready` pub/sub, matchmaking rate limiting.
  - Nginx: terminates HTTP/WS and routes to backend, frontend, realtime services, observability stack.
  - Docker compose: dev/prod stacks.
  - Prometheus/Grafana/ELK/cAdvisor: metrics & logs.

---

## 2. Control plane: from `/pong/online` to `/g/:roomId`

### 2.1 Frontend entry and matchmaking connection

Route: `/pong/online`  
Component: `apps/frontend/src/pages/pong/online/OnlineGame.tsx`

On load:

- React renders `OnlineGame` in `PongLayout`.
- `useMatchmakingClient` (`apps/frontend/src/pages/pong/online/hooks/useMatchmakingClient.ts`):
  - Creates a WebSocket client via `createMatchmakingClient`.
  - Connects to `/matchmaking`.
  - Handles `MatchmakingMessage` events and drives a small reducer state machine (idle, in_queue, match_found, starting, playing, postmatch).

Matchmaking WebSocket:

- On connect and auth success:
  - Sends `CONNECTED { clientId }`.
  - Restores tournament membership / invite lobbies if any.
- The frontend:
  - Stores `clientId`.
  - Shows “idle” or “in queue” UI based on state.

### 2.2 Joining the ranked queue and finding a match

When user clicks “Join queue”:

- Client → matchmaking:

  ```jsonc
  { "type": "JOIN_QUEUE" }
  ```

- Matchmaking:
  - Validates auth and client state.
  - Puts client in an **in‑memory** rating bucket queue (`apps/matchmaking/utils/queue.ts`).
  - If the client isn’t idle (tournament / invite lobby), matchmaking first sends `CONFIRM_REQUIRED` and waits for `CONFIRM_JOIN`.
  - Sends `QUEUE_JOINED`.

Background ticker (`tryMatchQueue`):

- Periodically scans buckets.
- When it finds a good pair:
  - Creates a `PendingMatch`.
  - Starts a short accept window (~15s) before fallback/requeue.
  - Moves both players to `PENDING_MATCH_ACCEPTANCE`.
  - Sends `MATCH_FOUND` to each with opponent username/mmr.

UI:

- `OnlineGame` shows a “Match found” panel with accept/decline.

If user accepts:

- Client → matchmaking:

  ```jsonc
  { "type": "ACCEPT_MATCH", "matchId": "…" }
  ```

- When both accept:
  - Matchmaking calls allocator to create the actual game room.

### 2.3 Allocator and join tokens

Allocator call:

- Matchmaking posts to allocator `/allocate` with:
  - `idempotencyKey` (match id) to make retries safe.
  - `mode` (ranked/invite/tournament).
  - `players` (playerIdentifier, side, alias, mmr).
  - `randomSeed`.
  - `simulationStartTick` (epoch‑ms planned start time; name is historical).
  - Optional `tournament` context.

Allocator:

- Picks a game node based on scorer’s scores.
- Calls game node admin HTTP to register a room.
- Writes `room-to-node:<roomIdentifier>` in Redis so the gateway can route `/g/:roomId`.
- Caches allocations under the idempotency key to dedupe transient retries.
- Issues **join tokens** for each player:
  - `JoinTokenClaims` include:
    - `roomIdentifier`.
    - `sub` (user UUID).
    - `side` (`west`/`east`).
    - `simulationStartTick`.
    - Expiration and unique `jti`.
    - Optional `tournament` fields.
  - Signed HMAC tokens; single‑use enforced by the gateway via Redis `join-token:<jti>`.

Allocator returns:

- `roomIdentifier`.
- `endpointUrl` (e.g. `/g/:roomIdentifier`).
- `perPlayerJoinTokens`.

### 2.4 Handoff to the game

Matchmaking sends `HANDOFF` to each player:

- `HandoffMessage` includes:
  - `matchId`, `roomIdentifier`.
  - `gameServerWSUrl`.
  - `side`.
  - `joinToken` (+ TTL).
  - `randomSeed`, `simulationStartTick`.
  - Optional `tournament` context.

The frontend:

- `useMatchmakingClient` dispatches `handoff`.
- Online state becomes `starting` with:
  - `serverUrl`, `roomIdentifier`, `matchId`.
  - `joinToken`, `randomSeed`, and seat mapping.
- `useGameBootstrap`:
  - Builds a config from handoff.
  - Calls `connectOnline` to open a WebSocket to the game via the gateway.
- Matchmaking starts a short handoff window; if a player doesn’t join in time it sends `HANDOFF_TIMEOUT` and rolls back/requeues as needed.

### 2.5 Gateway and room lookup

Gateway endpoint: `/g/:roomId`

Client:

- Opens a WebSocket:
  - URL: `wsUrl(serverUrl)`, typically `/g/:roomIdentifier`.
  - Subprotocol: `bearer,<joinToken>`.

Gateway:

- Validates:
  - Join token signature and claims (room, side, exp, jti).
  - Single use (stores `join-token:<jti>` in Redis with `NX`).
- Finds the game node by looking up `room-to-node:<roomIdentifier>` in Redis.
- Proxies the WS connection to the correct game server.

Game server:

- Re‑validates the join token.
- Verifies that `join-token:<jti>` exists in Redis (guard against bypassing the gateway).
- Attaches the player’s socket to a `MatchSession` with appropriate seat (P1/P2, east/west).
- When both players are connected:
  - Schedules the match start and begins sending room state and frames (data plane).

Matchmaking finishes the control plane when it hears `room_ready` from Redis and closes `/matchmaking` sockets.

At this point, control plane is done; data plane takes over.

---

## 3. Data plane: ticks, frames, and latency

The data plane is what happens on the game WebSocket once both players are connected.

### 3.1 Server tick loop and frames

Game server:

- Runs a deterministic simulation loop in `MatchRunner`:
  - Tick rate `tickHz` (e.g. 60 Hz).
  - For each tick:
    - Reads current inputs (axes) from both players.
    - Advances the physics and match rules (`game-logic`).
    - Emits server events (goals, serves, match over).
    - Updates an internal `MatchSnapshot`.
    - Increments `tick`.
    - Broadcasts a `FRAME` message.

`FRAME` message:

- Contains:
  - `state` – full game state at this tick.
  - `events` – events that occurred on this tick.
  - `match` – match summary snapshot (scores, history).
  - `tick` – authoritative tick index.
  - `axis` – opponent’s paddle axis from the recipient’s perspective.

### 3.2 Client consumption and start synchronization

Client (via `connectOnline` and render host):

- On `ROOM_STATE`:
  - Learns room status: `WAITING_FOR_OPPONENT`, `READY`, or `PLAYING`.
  - Receives `startAtEpochMs`, `randomSeed`, and `tickRateHz`.
  - May synthesize a `StartSignal` if reconnecting, so the client can start rendering.

- On `START`:
  - Receives explicit `startAtEpochMs`, `randomSeed`, `tickRateHz`, and players info.
  - Uses `startAtEpochMs` to align local simulation/rendering with server time.

- On `FRAME`:
  - Feeds `state`, `events`, `match` into the Pong renderer.
  - Uses `axis` to render the opponent paddle.

Latency handling:

- Client periodically sends `ping` with timestamp.
- Server replies with `PONG` including `clientSentAt`, `serverReceivedAt`, `serverSentAt`.
- Client computes RTT and applies a smoothing filter (EMA) to track average latency.
- Renderer can use this to adjust buffer size / smoothing.

Lag compensation:

- Server uses a small lag compensation window in physics to make paddle hits more forgiving under latency.

---

## 4. Tokens and security (end to end)

There are three main layers of tokens:

1. **Site auth tokens** (backend):
   - `SECRET`‑signed JWTs (access/refresh).
   - Used for:
     - REST calls from the frontend.
     - Auth in matchmaking (`/matchmaking`) and chat (`/chat`), via cookies.

2. **Join tokens** (allocator → gateway → game server):
   - HMAC tokens (`REALTIME_TOKEN_SECRET`).
   - Claims include:
     - `roomIdentifier`, `sub` = user uuid, `side`, `simulationStartTick`.
     - Expiration and unique `jti`.
     - Optional tournament context.
   - Enforced:
     - Single use: gateway writes `join-token:<jti>` with `NX` + TTL; game server checks it exists.
     - Room/side consistency.

3. **Resume tokens** (game server → client → gateway → game server):
   - Issued by `ResumeTokenService` on the game server (`apps/game-server/src/app/ResumeTokenService.ts`).
   - Rotated periodically while connected; stored in Redis as `resume-token:<jti>`.
   - Contain:
     - `roomIdentifier`, `sub` (player identifier), `sessionIdentifier`.
     - Expiration (`exp`) and unique `jti`.
   - On reconnect:
     - Client opens WS to `/g/:roomId` with `Sec-WebSocket-Protocol: resume,<token>`.
     - Gateway validates; game server consumes token and re‑attaches player to session.

Security properties:

- Browser never sees long‑lived secrets; join/resume tokens are short‑lived and single‑use.
- Game access is controlled at the edge (gateway) using join/resume tokens.
- Backend identity is controlled via HTTP‑only JWT cookies.

---

## 5. Reconnect and resume behavior

Goal: survive short network glitches and refreshes without losing the match.

### 5.1 On the game server

- For each connected player:
  - Game server periodically issues `RESUME_TOKEN` messages with:
    - Fresh token (`resumeToken`) and expiry.
    - Enough TTL to cover reconnect grace plus rotation period.
- On disconnect:
  - `ReconnectManager` (`apps/game-server/src/app/ReconnectManager.ts`):
    - Starts a grace timer (casual vs tournament grace).
    - If match started:
      - Pauses tick loop.
      - Sends `OPPONENT_DISCONNECTED` with `gracePeriodMs` to the remaining player.
    - If the missing player does not reconnect in time:
      - Ends match with reason `'opponent_timeout'` and reports result.
      - Sends `MATCH_END` with reason `'opponent_timeout'`.
  - On reconnect with a valid resume token:
    - Re‑attaches the player.
    - Cancels grace timer.
    - Sends `OPPONENT_RECONNECTED` and resumes match loop.

### 5.2 On the client

- `connectOnline`:
  - (`apps/frontend/src/games/pong/modes/online/connect-online.ts`)
  - Tracks the latest resume token (in memory and in `sessionStorage`).
  - Has a reconnection engine (`createReconnector` in `apps/frontend/src/games/pong/modes/online/reconnect.ts`):
    - When the WS closes unexpectedly (non‑permanent code) and a resume token is still valid:
      - Attempts to reconnect using `resume` subprotocol with exponential backoff (bounded).
    - Distinguishes:
      - Permanent closes (`CLOSE_CODES`) → stop and emit `'connection_closed'` match end.
      - Policy/rejected resumes (4400–4499, or too many pre‑open failures) → give up and clear tokens.
- Auto‑resume:
  - When the user comes back to `/pong/online` (or tournament detail) and has a stored resume token for a room:
    - The UI seeds a synthetic `handoff` (room + `/g/:roomId`).
    - `useGameBootstrap` then connects in resume mode instead of join mode.

From a UX standpoint:

- Short connection drops show a temporary “reconnecting” experience and then resume.
- Longer outages or token errors result in:
  - `'connection_closed'` match end.
  - A snackbar/error and a return to a safe page.

---

## 6. Invites and tournaments (online variations)

### 6.1 Invite matches (chat → matchmaking → game)

Flows:

- Chat (`/chat`) allows a user to send `inviteUser` messages.
- Chat server:
  - Validates availability with matchmaking by calling `/invite-match?validateOnly=true`.
  - On accept:
    - Calls `/invite-match` to create an invite lobby in matchmaking.
- Matchmaking:
  - Tracks invite lobbies and maps them to players.
  - When both players connect to `/matchmaking` in that lobby:
    - Calls `createMatch(a, b, 'invite')`.
    - Sends `HANDOFF` just like ranked, but with mode `'invite'`.
- From that point on:
  - Flow is identical to ranked online (gateway + game server + data plane).

### 6.2 Tournament matches

Flows:

- Tournament pages:
  - Use `/matchmaking` WS for tournament messages (`TOURNAMENT_*`).
  - Use HTTP `/api/tournaments/*` for detailed state.
- Matchmaking:
  - Maintains tournament membership and subscriptions.
  - When backend schedules matches:
    - Sends `TOURNAMENT_MATCHES_READY` to players.
    - Runs a countdown via `TOURNAMENT_MATCH_COUNTDOWN`.
    - On ready and timeout conditions:
      - Calls `createMatch(a, b, mode, { tournament })` to start a Pong match.
      - Sends `HANDOFF` with `TournamentContext`.
- Game server:
  - Treats the match like any other, but:
    - Uses tournament‑specific reconnect grace.
    - Reports results to tournament endpoints (backend), which update the bracket.

The key point for interviews:

- Invites and tournaments **reuse the same online match pipeline** once a handoff is issued:
  - Same join tokens / gateway path.
  - Same game node and data plane.
  - Just different upstream control logic (chat + `/invite-match`, or tournaments + `TOURNAMENT_*` messages).

---

## 7. Failure modes – quick mental model

At a high level, failures can be grouped by where they occur and what the user sees:

- **Matchmaking:**
  - Auth errors → `ERROR AUTH` → snackbar + logout, online state reset.
  - Allocator busy → `ERROR ALLOCATOR` → snackbar (“servers busy”), state back to idle.
  - Rate‑limit → `ERROR RATELIMIT` → warning snackbar, state unchanged.
  - Match timeouts/declines → `MATCH_TIMEOUT` / `MATCH_DECLINED` → idle with snackbar.

- **Gateway / join/resume:**
  - Invalid/missing/reused join token, join window expired, room not found, match finished:
    - WS close with `CLOSE_CODES` (4401/4402/4403/4404/4408/4410).
    - Online host treats these as permanent → `'connection_closed'` match end → error + back to lobby.

- **Game server:**
  - Opponent never reconnects → `MATCH_END` with reason `'opponent_timeout'` → “opponent disconnected” UX.
  - Explicit forfeit → `MATCH_END` with reason `'forfeit'` → "you/opponent forfeited" UX.
  - Resume token rejected → reconnection gives up, treated as connection closed.

Knowing this classification lets you explain how the system fails and recovers, not just the happy path.

---

## 8. How to narrate this in an interview

When asked “How does your online Pong system work?”, you can roughly follow this outline:

1. **Architecture overview** – web app + microservices (backend, matchmaking, allocator, game‑server, gateway, chat), Redis, Nginx, Docker, observability.
2. **Control plane** – `/pong/online` connects to `/matchmaking`, joins queue, `MATCH_FOUND`, allocator, join tokens, `HANDOFF`, and gateway `/g/:roomId`.
3. **Data plane** – game server tick loop, `FRAME` messages, `ROOM_STATE`/`START`, latency measurement, lag compensation.
4. **Tokens and security** – site auth JWTs, join tokens, resume tokens; single‑use and expiry; gateway enforcing room admission.
5. **Reconnect/resume** – resume tokens, server‑side grace windows, client reconnect loop, and UX.
6. **Variations** – invite matches and tournaments reuse the same pipeline with different control logic and extra context.
7. **Failure modes** – key error paths and what the user sees.

Use this doc as your cheat sheet, and jump into the referenced files/docs when you want to refresh specific details.
