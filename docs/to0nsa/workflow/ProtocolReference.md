# Online Pong Network Protocol – Reference

This document is a **wire‑protocol reference** for online Pong:

- Enumerates the WebSocket message types used between:
  - Browser ↔ Matchmaking (`/matchmaking`).
  - Browser ↔ Game node (`/g/:roomId` via the gateway).
- Describes for each message:
  - Who sends it.
  - When it is sent.
  - How the other side reacts.

Types come from:

- `packages/pong/shared/src/protocol/net.ts`

For higher‑level flows, see:

- `OnlinePongNetwork.md`
- `MatchmakingService.md`
- `GameNode.md`
- `SecurityAndTokens.md`

---

## 1. Matchmaking WebSocket (`/matchmaking`)

Matchmaking uses two message families:

- **Client → server**: `MatchmakingClientMessage`.
- **Server → client**: `MatchmakingMessage`.

### 1.1 Client → server: `MatchmakingClientMessage`

All messages are JSON objects with a `type` field.

- `JOIN_QUEUE` (`JoinQueueRequest`)
  - **Sent by:** Browser.
  - **Payload:**
    - `preferredSide?: 'west' | 'east'` (optional hint).
  - **When:** User clicks “Join queue”.
  - **Server reaction:**
    - If client is idle → add to queue, send `QUEUE_JOINED`.
    - If client is in a tournament or invite lobby → send `CONFIRM_REQUIRED` instead.

- `LEAVE_QUEUE` (`LeaveQueueRequest`)
  - **Sent by:** Browser.
  - **When:** User cancels queue.
  - **Server reaction:** If client is in queue → remove from queue, send `QUEUE_LEFT`.

- `ACCEPT_MATCH` (`AcceptMatchRequest`)
  - **Sent by:** Browser.
  - **Payload:** `matchId: string` (server’s match identifier).
  - **When:** User clicks “Accept” on a found match.
  - **Server reaction:**
    - Mark this client as having accepted.
    - When both sides accept and room is allocated, sends `HANDOFF`.

- `DECLINE_MATCH` (`DeclineMatchRequest`)
  - **Sent by:** Browser.
  - **Payload:** `matchId: string`.
  - **When:** User clicks “Decline”.
  - **Server reaction:**
    - Cancels the pending match.
    - Sends `MATCH_DECLINED` to relevant clients.

- `CONFIRM_JOIN` (`ConfirmJoinRequest`)
  - **Sent by:** Browser.
  - **When:** User confirms leaving an existing tournament or invite lobby to join the ranked queue (in response to `CONFIRM_REQUIRED`).
  - **Server reaction:**
    - Clears competing state (tournament/invite).
    - Moves client into main queue and sends `QUEUE_JOINED`.

#### Tournament‑related client messages

Used when the user interacts with tournament UIs via matchmaking:

- `CREATE_TOURNAMENT` (`CreateTournamentRequest`)
  - **Sent by:** Browser.
  - **Payload:**
    - `size: 4 | 8 | 16` – bracket size.
    - `name?: string` – optional tournament name.
  - **Server reaction:** Create a new tournament; mirror state via `TOURNAMENT_LOBBY_UPDATED` and bracket snapshots.

- `JOIN_TOURNAMENT` (`JoinTournamentRequest`)
  - **Sent by:** Browser.
  - **Payload:** `tournamentId: string`.
  - **When:** User joins an existing tournament lobby.
  - **Server reaction:** Add participant; broadcast via `TOURNAMENT_LOBBY_UPDATED`.

- `LEAVE_TOURNAMENT` (`LeaveTournamentRequest`)
  - **Sent by:** Browser.
  - **When:** User leaves a tournament lobby or active tournament.
  - **Server reaction:** Remove/mark participant; update lobby/bracket state.

- `FORFEIT_TOURNAMENT` (`ForfeitTournamentRequest`)
  - **Sent by:** Browser.
  - **When:** User explicitly forfeits their tournament participation.
  - **Server reaction:** Mark participant as forfeited and update tournament state.

- `ACCEPT_SCHEDULED` (`AcceptScheduledRequest`)
  - **Sent by:** Browser.
  - **Payload:** `tournamentMatchId: number`.
  - **When:** Player accepts a scheduled tournament match (e.g., from a countdown).
  - **Server reaction:** Mark that player as ready for the upcoming tournament match; when both sides are ready, scheduling proceeds to allocator/game server.

---

### 1.2 Server → client: `MatchmakingMessage`

These messages are sent from matchmaking to the browser.

#### Connection and queue state

- `CONNECTED` (`ConnectedMessage`)
  - **Payload:** `clientId: string`.
  - **When:** Immediately after a new WS connection is authenticated.
  - **Client reaction:**
    - Store `clientId` in state.
    - Mark matchmaking status as `'connecting'` → `'idle'`.

- `QUEUE_JOINED` (`QueueJoinedMessage`)
  - **When:** Client successfully joins the queue.
  - **Client reaction:**
    - Set state to `'in_queue'`.
    - Start queue timer UI.

- `QUEUE_LEFT` (`QueueLeftMessage`)
  - **When:** Client leaves queue or is removed from it.
  - **Client reaction:** State → `'idle'`.

#### Matchmaking results

- `MATCH_FOUND` (`MatchFoundMessage`)
  - **Payload:**
    - `matchId: string` – internal match identifier.
    - `opponent: { username: string; mmr: number }`.
  - **When:** Server pairs the client with an opponent.
  - **Client reaction:**
    - Transition to `'match_found'`.
    - Show opponent info and accept/decline UI.

- `MATCH_DECLINED` (`MatchDeclinedMessage`)
  - **Payload:** `matchId: string`.
  - **When:** Match is cancelled (opponent declined or timed out).
  - **Client reaction:**
    - Transition to `'idle'` or `'in_queue'` depending on logic.
    - Show snackbar “Match declined or unavailable.”

- `MATCH_TIMEOUT` (`MatchTimeoutMessage`)
  - **When:** Pending match times out waiting for acceptance.
  - **Client reaction:**
    - Transition to `'idle'` or `'in_queue'`.
    - Show snackbar “Pending match timed out.”

#### Handoff to game server

- `HANDOFF` (`HandoffMessage`)
  - **Payload:**
    - `matchId: string` – same as above.
    - `roomIdentifier: string` – game room ID.
    - `gameServerWSUrl: string` – WS URL (typically `/g/:roomId`).
    - `side: 'west' | 'east'` – logical side.
    - `joinToken: string` – single‑use join token.
    - `joinTokenTTLSeconds: number` – TTL hint.
    - `randomSeed: number` – game seed for deterministic logic.
    - `simulationStartTick: number` – sync tick for simulation start.
    - `tournament?: TournamentContext` – additional tournament metadata.
  - **When:** Both players accept the match and allocator/game node have created a room.
  - **Client reaction:**
    - Store handoff payload in state.
    - Build a `bootstrapConfig` for `useGameBootstrap`.
    - Connect to `/g/:roomId` via game gateway using `joinToken`.

- `HANDOFF_TIMEOUT` (`HandoffTimeoutMessage`)
  - **Payload:**
    - `roomIdentifier: string`.
    - `message: string` – human‑readable explanation.
  - **When:** Handoff fails or takes too long (e.g., allocator or game node didn’t create room in time).
  - **Client reaction:**
    - Return to safe state (e.g., `'idle'`).
    - Show error snackbar using `message`.

#### Info and errors

- `ERROR` (`ErrorMessage`)
  - **Payload:**
    - `code: string` – e.g., `'AUTH'`, `'ALLOCATOR'`, `'RATELIMIT'`, or others.
    - `message: string` – description.
  - **When:** Various error conditions:
    - Auth failure (missing/invalid token).
    - Allocator or game server errors.
    - Rate limiting violations.
  - **Client reaction:**
    - Use the `code` to pick a handler:
      - `'AUTH'` → attempt refresh or log out (`handleAuthError` in `OnlineGame.tsx`).
      - `'ALLOCATOR'` → show allocator/server busy message.
      - `'RATELIMIT'` → show rate‑limit message.
    - Reset queue/match state appropriately.

- `INFO` (`InfoMessage`)
  - **Payload:** `message: string`.
  - **When:** Informational notifications (e.g., notifying about a new connection replacing the old one).
  - **Client reaction:**
    - Usually logs; special cases may mark a socket as intentionally closed (to avoid noisy reconnects).

#### Confirmation

- `CONFIRM_REQUIRED` (`ConfirmRequiredMessage`)
  - **Payload:** `message: string`.
  - **When:** Client tries to join the queue while already in a tournament or invite lobby.
  - **Client reaction:**
    - Show a confirmation dialog with `message`.
    - If the user agrees, send `CONFIRM_JOIN`.

#### Tournament state messages

These messages drive the tournament UI via matchmaking:

- `TOURNAMENT_LOBBY_UPDATED` (`TournamentLobbyUpdatedMessage`)
  - **Payload:**
    - `tournamentId: number`.
    - `status: string`.
    - `maxParticipants: number | null`.
    - `participants: TournamentParticipantState[]`.
  - **When:** Tournament lobby membership or status changes.
  - **Client reaction:** Update lobby view (participants list, status).

- `TOURNAMENT_BRACKET_SNAPSHOT` (`TournamentBracketSnapshotMessage`)
  - **Payload:**
    - `tournamentId: number`.
    - `matches: TournamentMatchState[]`.
  - **When:** Full bracket snapshot is needed (e.g., on join or major updates).
  - **Client reaction:** Render or refresh bracket view.

- `TOURNAMENT_MATCHES_READY` (`TournamentMatchesReadyMessage`)
  - **Payload:**
    - `tournamentId: number`.
    - `matches: { tournamentMatchId, stage, participants[] }[]`.
  - **When:** Backend decides a set of tournament matches are ready to be scheduled (via Redis streams).
  - **Client reaction:** Show scheduled matches in tournament UI; prompt players to accept match (`ACCEPT_SCHEDULED`).

- `TOURNAMENT_MATCH_COUNTDOWN` (`TournamentMatchCountdownMessage`)
  - **Payload:**
    - `tournamentId`, `tournamentMatchId`, `stage`.
    - `secondsRemaining`, `targetStartEpochMs`.
    - `status: 'running' | 'cancelled' | 'started'`.
    - Optional `reason` for cancellation (`'offline' | 'forfeited' | 'stopped'`).
  - **When:** Tournament match countdown starts/updates/cancels/starts.
  - **Client reaction:**
    - Show countdown in UI.
    - React to cancellation reasons (e.g., show “opponent offline” message).
    - Transition to match view when `status === 'started'`.

---

## 2. Game server WebSocket protocol (`/g/:roomId`)

After handoff, the browser connects to the game server via the gateway on `/g/:roomId`.

Messages are:

- **Client → server**:
  - Unstructured from the protocol type’s perspective (e.g., `ping`, `axis`, `forfeit` messages).
  - Defined in the client host code (`connect-online.ts`) and handled by `WSServer`.
- **Server → client**:
  - Typed as `GameServerControlMessage`.

### 2.1 Server → client: `GameServerControlMessage`

- `ROOM_STATE` (`RoomStateMessage`)
  - **Payload:**
    - `roomIdentifier: string`.
    - `state: 'WAITING_FOR_OPPONENT' | 'READY' | 'PLAYING'`.
    - `seat?: 'P1' | 'P2'` – which seat the client occupies.
    - `startAtEpochMs?`, `randomSeed?`, `tickRateHz?` – scheduling hints.
    - `players?: { P1?: { alias? }, P2?: { alias? } }` – display names.
  - **When:** Room state changes (player joins/leaves, match becomes ready).
  - **Client reaction:**
    - Update room status UI (e.g., “Waiting for opponent”, “Ready”).
    - In reconnect scenarios, may synthesize a `START` from this if needed.

- `START` (`StartMessage`)
  - **Payload:**
    - `roomIdentifier`.
    - `startAtEpochMs` – when the simulation should start.
    - `randomSeed` – deterministic seed.
    - `tickRateHz` – server tick rate.
    - `players?` – aliases for P1/P2.
  - **When:** Match is ready to begin; both players have joined.
  - **Client reaction:**
    - Resolve `awaitStart()` in `connect-online.ts`.
    - Kick off local simulation/rendering synchronized to `startAtEpochMs`.

- `FRAME` (`FrameMessage`)
  - **Payload:**
    - `state: any` – authoritative game state for this tick/frame.
    - `events: any` – events (e.g., goals, serves).
    - `match: MatchSnapshot` – simplified match snapshot (scores, history).
    - `tick: number` – simulation tick index.
    - `axis?: number` – opponent input axis for this tick (from recipient’s POV).
  - **When:** At a regular rate (e.g., 20–25 Hz) during the match.
  - **Client reaction:**
    - Update game logic/rendering in `@pong/render`.
    - Feed state/events into visual updates and animations.

- `OPPONENT_DISCONNECTED` (`OpponentDisconnectedMessage`)
  - **Payload:** `gracePeriodMs: number`.
  - **When:** Opponent disconnects and reconnect grace timer starts.
  - **Client reaction:**
    - Show UI indicating opponent disconnect.
    - Possibly show countdown based on `gracePeriodMs`.
    - If opponent doesn’t return, match will end in a forfeit/timeout.

- `OPPONENT_RECONNECTED` (`OpponentReconnectedMessage`)
  - **When:** Opponent reconnects within the grace window.
  - **Client reaction:**
    - Clear disconnect UI.
    - Resume normal play.

- `MATCH_END` (`MatchEndMessage`)
  - **Payload:**
    - `reason: 'opponent_timeout' | 'completed' | 'error' | 'forfeit'`.
    - `winner?: 'east' | 'west'`.
    - `summary?: OnlineMatchSummary | null` – full match summary when available.
  - **When:** Match is over:
    - Natural conclusion (best‑of complete).
    - Forfeit (explicit or via disconnect timeout).
    - Error.
  - **Client reaction:**
    - `useOnlineMatchEnd` interprets reason, shows snackbars.
    - Moves online state machine to `'postmatch'` and renders post‑match summary.
    - Clears resume tokens for this room.

- `RESUME_TOKEN` (`ResumeTokenMessage`)
  - **Payload:**
    - `token: string` – signed resume token.
    - `isTournament?: boolean` – flagged for tournaments.
    - `tournamentId?: number` – when applicable.
  - **When:** Game server periodically rotates resume tokens for connected players.
  - **Client reaction:**
    - Store token (e.g., in session/local storage) via `saveResumeTokenToSession`.
    - Use on reconnect via `Sec-WebSocket-Protocol: resume,<token>`; see `SecurityAndTokens.md`.

- `PONG` (`PongMessage`)
  - **Payload:**
    - `clientSentAt: number`.
    - `serverReceivedAt: number`.
    - `serverSentAt: number`.
  - **When:** In response to client `ping` messages.
  - **Client reaction:**
    - Compute RTT and smoothed latency in `connect-online.ts`.
    - Use for latency displays and potentially time sync adjustments.

---

### 2.2 Client → server messages (conceptual)

While not all client messages are declared in `net.ts`, the most important are:

- `ping`:
  - **Shape:** `{ type: 'ping', clientSentAt: number }`.
  - **When:** Sent periodically by client to measure latency.
  - **Server reaction:** Responds with `PONG`.

- `axis`:
  - **Shape:** `{ type: 'axis', axis: number }`.
  - **When:** Sent on input changes to communicate paddle movement.
  - **Server reaction:** Updates player axis in `RoomRegistry`; affects subsequent frames.

- `forfeit`:
  - **Shape:** `{ type: 'forfeit' }`.
  - **When:** Player quits the match via UI.
  - **Server reaction:** Immediately ends match as a forfeit, reports result to backend, and sends `MATCH_END` to both players.

These are implemented in:

- Client side: `apps/frontend/src/games/pong/modes/online/connect-online.ts`.
- Server side: `apps/game-server/src/infra/ws/WSServer.ts`.

---

## 3. Close codes

Close codes are defined in `CLOSE_CODES` in `net.ts` and used by:

- Game server (`WSServer`) when rejecting or closing connections.
- Gateway (`game-gateway/index.ts`) when rejecting upgrades.
- Client reconnect logic (`connect-online.ts`) to decide whether an error is permanent.

Defined codes:

- `ROOM_NOT_FOUND` (4404)
  - Room doesn’t exist or session is gone.
  - Typically treated as permanent – client should stop trying to resume this room.

- `MISSING_TOKEN` (4401)
  - No join/resume token provided on connection.

- `INVALID_TOKEN` (4401)
  - Join/resume token failed validation (bad signature, room mismatch, wrong issuer/audience).

- `TOKEN_REUSED` (4403)
  - Join token was already consumed (single‑use enforcement).

- `PLAYER_NOT_AUTHORIZED` (4403)
  - Token subject doesn’t match any expected player for this room.

- `SEAT_OCCUPIED` (4402)
  - Seat already taken by another connection.

- `SIDE_MISMATCH` (4403)
  - Token’s side/seat conflicts with expected reservation.

- `JOIN_WINDOW_EXPIRED` (4408)
  - Join attempt after the allowed join window for the room.

- `MATCH_FINISHED` (4410)
  - Resume attempt for a match that has already finished.

- `SERVER_ERROR` (1011)
  - Internal server error during connection handling.

Client behavior (high level):

- Codes in `CLOSE_CODES` are treated as **permanent failures** for that room:
  - `connect-online.ts` includes them in its `PERMANENT_CLOSE_CODES` set.
  - After receiving such a close code, reconnect/resume logic gives up and clears resume tokens.

---

## 4. Where to find implementations

Code locations:

- Types and message definitions:
  - `packages/pong/shared/src/protocol/net.ts`
- Matchmaking server:
  - `apps/matchmaking/index.ts`
  - `apps/matchmaking/utils/MatchmakingRedisBridge.ts` (tournament streams)
- Game gateway:
  - `apps/game-gateway/index.ts`
- Game server:
  - `apps/game-server/src/infra/ws/WSServer.ts`
  - `apps/game-server/src/app/ResumeTokenService.ts`
- Client host:
  - `apps/frontend/src/games/pong/modes/online/connect-online.ts`
  - `apps/frontend/src/pages/pong/online/hooks/useMatchmakingClient.ts`

Use this reference alongside the higher‑level workflow docs whenever you need to reason about a specific message or close code in the online Pong stack.
