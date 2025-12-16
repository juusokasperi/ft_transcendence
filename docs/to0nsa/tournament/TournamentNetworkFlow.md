# Tournament Network Flow – End to End

This document is the **tournament‑centric counterpart to `OnlinePongNetwork.md`**.

It explains, from the player’s point of view:

- How the tournament UI talks to the backend and matchmaking.
- Which WebSocket and HTTP calls are involved from:
  - Opening `/pong/tournaments`
  - → joining or creating a tournament
  - → lobby & bracket updates
  - → scheduled match countdown
  - → in‑game `HANDOFF` and match WebSocket
  - → result reporting and bracket refresh.

Read this together with:

- `TournamentFrontend.md` – components and hooks used on the frontend.
- `TournamentMatchmaking.md` – matchmaking internals for tournaments.
- `TournamentMatchFlow.md` – per‑match flow from `TOURNAMENT_MATCHES_READY` to `MATCH_END`.
- `OnlinePongNetwork.md` – for the generic online match flow (which tournaments reuse once the handoff happens).

---

## 0. High‑level architecture (tournament edition)

At a high level, tournaments are layered on top of the existing online stack:

- **Frontend** (`apps/frontend/src/pages/pong/tournament/*`):
  - Renders tournament lobby and bracket pages.
  - Uses:
    - HTTP to list tournaments, participants, and matches.
    - A **matchmaking WebSocket** (via `TournamentSocket`) for tournament messages.
  - Bootstraps actual matches using the **same online host** as `/pong/online`.

- **Backend** (`apps/backend`):
  - Owns tournament data:
    - Tournaments table.
    - Participants table.
    - Tournament matches and their link to Pong matches.
  - Exposes HTTP APIs (`/api/tournaments/*`) used by both the frontend and matchmaking.

- **Matchmaking** (`apps/matchmaking`):
  - Manages tournament membership and subscriptions.
  - Drives scheduled matches (`scheduledMatches.ts`) and emits:
    - `TOURNAMENT_LOBBY_UPDATED`
    - `TOURNAMENT_BRACKET_SNAPSHOT`
    - `TOURNAMENT_MATCHES_READY`
    - `TOURNAMENT_MATCH_COUNTDOWN`
  - Uses the **allocator** to create tournament matches, just like casual matches.

- **Allocator + Game Node + Gateway**:
  - Same as online mode:
    - Allocator talks to game nodes and mints join tokens (extended with tournament context).
    - Gateway exposes `/g/:roomId` and validates tokens.
    - Game nodes run the matches and report results back to the backend (including tournament info).

---

## 1. Opening tournament pages

### 1.1 Routes and pages

Frontend routes:

- `/pong/tournaments` → `TournamentPage.tsx`
- `/pong/tournaments/:id` → `TournamentDetail.tsx`

Both routes use `useTournamentPageController` for most behavior:

- Fetching tournament lists/details via HTTP.
- Managing WebSocket connection state.
- Driving the in‑page state machine (lobby vs bracket vs in‑match).

### 1.2 Initial HTTP fetches

When you open `/pong/tournaments`:

- `useTournamentPageController` calls `useTournamentList`, which:
  - Uses Axios to call:
    - `GET /api/tournaments` – list of tournaments with status, max participants, etc.
  - Filters tournaments for display (e.g. active vs completed).

When you open `/pong/tournaments/:id`:

- `useActiveTournament` loads the detailed state for a specific tournament:
  - `GET /api/tournaments/:id`
  - `GET /api/tournaments/:id/participants`
  - `GET /api/tournaments/:id/matches`
  - These are the same endpoints matchmaking uses under the hood in `scheduledMatches.ts`.

HTTP is used for:

- The **initial snapshot** of lobby and bracket.
- Refreshing state on demand (e.g. via "refresh" or when joining/leaving).

WebSockets are used for:

- Incremental updates and scheduling (`TOURNAMENT_*` messages).

---

## 2. Tournament WebSocket connection

Tournament pages use **the same `/matchmaking` WebSocket** as online mode, but with different message routing.

### 2.1 Connecting via `TournamentSocket`

`TournamentSocket` (`apps/frontend/src/pages/pong/tournament/net/TournamentSocket.ts`):

- Wraps `createMatchmakingClient` (same as `useMatchmakingClient` uses).
- On `connect(handlers)`:
  - Opens a WebSocket to `wsUrl('/matchmaking')`.
  - Uses the **same cookie/token auth** as online matchmaking.
  - Forwards `MatchmakingMessage` values to `handlers.onMessage`.

### 2.2 Connection management (`useTournamentConnection`)

`useTournamentConnection`:

- Keeps a `TournamentSocket` instance in a ref.
- Handles:
  - Reconnect loops with backoff (`connectionBackoff.ts`).
  - Connection status reporting via `setConnectionReady`.
  - Snackbars on errors and reconnect attempts.

When the user is logged in (`userReady && userUuid`):

- It:
  - Starts the initial connection.
  - Reconnects automatically on transient errors.
  - Closes and resets on unmount or when the user logs out.

### 2.3 Messages routed to tournament controller

`useTournamentPageController` passes a handler:

- `handleMessage(msg: MatchmakingMessage)`, which:
  - Wraps the message into a `MessageCtx`.
  - Calls `routeMessage(msg, ctx)` (`apps/frontend/src/pages/pong/tournament/net/router.ts`).

`routeMessage` splits tournament messages into high‑level handlers, which:

- Update reduced state:
  - Lobby participants.
  - Bracket snapshot.
  - Ready matches.
  - Countdowns.
- Trigger snackbars and navigations when necessary.

---

## 3. Joining and creating tournaments (client → server)

Tournament commands are part of `MatchmakingClientMessage` (see `ProtocolReference.md`):

- `CREATE_TOURNAMENT`
- `JOIN_TOURNAMENT`
- `LEAVE_TOURNAMENT`
- `FORFEIT_TOURNAMENT`
- `ACCEPT_SCHEDULED`

### 3.1 Creating a tournament

In `useTournamentPageController`:

- When the user clicks “Create tournament”:

```ts
handleCreateTournamentClick() {
  createTournament(TOURNAMENT_SIZE, tournamentName);
}
```

`TournamentSocket.createTournament(size, name)` → matchmaking sends:

```jsonc
{ "type": "CREATE_TOURNAMENT", "size": 4 | 8 | 16, "name": "…" }
```

Server side (`handleCreateTournament` in `scheduledMatches.ts`):

- Verifies the client is authenticated and has a site token.
- Ensures the user has no active tournament already.
- Calls backend:
  - `POST /api/tournaments` – create tournament.
  - `POST /api/tournaments/:id/participants` – register the creator as a participant.
- Sets:
  - `client.tournamentId` and `client.tournamentParticipantId`.
  - `ClientState.IN_TOURNAMENT`.
- Subscribes the client to tournament updates.
- Sends:
  - `TOURNAMENT_LOBBY_UPDATED` (snapshot of participants).
  - `TOURNAMENT_BRACKET_SNAPSHOT` (empty or early bracket).

### 3.2 Joining a tournament

On the client:

- “Join” button calls:

```ts
joinTournament(tournamentId);
```

Matchmaking receives:

```jsonc
{ "type": "JOIN_TOURNAMENT", "tournamentId": "<id>" }
```

`handleJoinTournament`:

- Validates tournament ID.
- Uses the site token to call backend:
  - `POST /api/tournaments/:id/participants` with:
    - `alias` (clamped username).
    - `userUuid`.
- Sets:
  - `client.tournamentId`, `client.tournamentParticipantId`.
  - `ClientState.IN_TOURNAMENT`.
- Subscribes client to this tournament’s updates.
- Calls `syncTournamentState` to fetch:
  - Tournament status & maxParticipants.
  - Participants list.
  - Matches with players and scores.
- Emits:
  - `TOURNAMENT_LOBBY_UPDATED`.
  - `TOURNAMENT_BRACKET_SNAPSHOT`.
- Calls `checkPendingMatchesForPlayer`:
  - If a match was already scheduled for this player, resends notifications and countdowns.

### 3.3 Leaving or forfeiting a tournament

Client actions:

- Leave:

```jsonc
{ "type": "LEAVE_TOURNAMENT", "tournamentId": "<id>" }
```

- Forfeit:

```jsonc
{ "type": "FORFEIT_TOURNAMENT", "tournamentId": "<id>" }
```

Matchmaking (`handleLeaveTournament` / `handleForfeitTournament`):

- Calls backend:
  - `DELETE /api/tournaments/:id/participants/:participantId` (leave), or
  - `PATCH /api/tournaments/:id/participants/:participantId` with `{ status: 'forfeited' }`.
- Cancels any pending countdowns/reminders involving this player and emits `TOURNAMENT_MATCH_COUNTDOWN` with `status: 'cancelled'` and `reason: 'forfeited'`.
- Refreshes tournament state and broadcasts:
  - `TOURNAMENT_LOBBY_UPDATED`.
  - `TOURNAMENT_BRACKET_SNAPSHOT`.
- Updates client state to `IDLE` and clears membership.

The frontend reflects:

- Updated participant statuses (e.g. `forfeited`).
- Bracket entries advancing the other player by walkover when appropriate.

---

## 4. Lobby updates and bracket snapshots (server → client)

Once a user is in a tournament, the main messages they see are:

- `TOURNAMENT_LOBBY_UPDATED`
- `TOURNAMENT_BRACKET_SNAPSHOT`

### 4.1 Tournament lobby updates

`TournamentLobbyUpdatedMessage` (see `protocol/net.ts`):

- Includes:
  - `tournamentId`
  - `status` (e.g. `waiting_for_players`, `running`, `completed`)
  - `maxParticipants`
  - `participants: TournamentParticipantState[]`

Emitted by:

- `syncTournamentState` in `scheduledMatches.ts`, which fetches:
  - Tournament info.
  - Participants (with alias, seed, status, userUuid).

Frontend behavior:

- `routeMessage` updates the tournament reducer:
  - Participants list.
  - Active tournament status.
- The UI shows:
  - Lobby participants with statuses (ready, playing, eliminated, forfeited).
  - Whether the tournament is waiting for more players, in progress, or done.

### 4.2 Bracket snapshots

`TournamentBracketSnapshotMessage`:

- Includes:
  - `tournamentId`
  - `matches: TournamentMatchState[]`
    - Each match has:
      - `tournamentMatchId`, `roundNumber`, `roundPosition`.
      - `status` (pending, scheduled, completed).
      - `scheduledAt`, `completedAt`.
      - `matchId` (link to Pong match when available).
      - `players` with participantId, teamNumber, alias, status, and (if completed) score.

Emitted by:

- Same `syncTournamentState` as lobby updates.

Frontend behavior:

- Reducer updates `bracket`.
- Selectors (`selectMatchesByStage`) group matches into:
  - Semifinals, finals, bronze matches, etc.
- `TournamentDetail` renders the bracket view from this state.

---

## 5. Scheduled matches, countdowns, and readiness

Once the tournament reaches the stage where a specific match is ready, matchmaking and backend coordinate to:

- Decide when the match should start.
- Notify the players that their match is ready.
- Run a countdown and enforce presence or auto‑forfeit rules.

### 5.1 TOURNAMENT_MATCHES_READY

When the backend schedules a match (via Redis streams / tournament bridge), `handleTournamentMatchesReady` in `scheduledMatches.ts` receives a payload with:

- `tournamentId`
- `matches: TournamentMatchesReadyMessage['matches']`
  - Each match includes `tournamentMatchId`, `stage`, and `participants` (userUuid, alias, participantId, teamNumber).

For each match:

- `handleSingleTournamentMatch(match, tournamentId, clients)` is called.

If both players are **available and connected** to `/matchmaking` with:

- `client.tournamentId === tournamentId`

Then:

- A `TOURNAMENT_MATCHES_READY` message is sent directly to those players:

```jsonc
{
  "type": "TOURNAMENT_MATCHES_READY",
  "tournamentId": 42,
  "matches": [
    {
      "tournamentMatchId": 10,
      "stage": "semifinal" | "final" | "bronze",
      "participants": [{ userUuid, alias, participantId, teamNumber }, …]
    }
  ]
}
```

The frontend:

- Stores the ready match in `latestReadyMatches`.
- Uses `useMatchCountdown` and `useMatchLifecycle` to show a “Match ready” indicator and begin managing countdown/status.

If players are **not both available**:

- The code schedules reminders and potential auto‑wins:
  - `scheduleTournamentReminder` and `scheduleAbsenceAutoWin`.

### 5.2 TOURNAMENT_MATCH_COUNTDOWN

When a match is ready, the server runs a countdown via `startTournamentCountdown`:

- Periodically emits `TOURNAMENT_MATCH_COUNTDOWN` with:
  - `status: 'running' | 'cancelled' | 'started'`
  - `secondsRemaining`
  - `targetStartEpochMs`
  - Optional `reason` (`offline`, `forfeited`, `stopped`) when cancelled.

Messages are sent to:

- All tournament subscribers.
- Directly to the two players in the match.

Frontend behavior:

- `useMatchCountdown`:
  - Tracks per‑match countdowns in a map keyed by `tournamentMatchId`.
  - Computes a displayable `countdownStatus` and `countdownSecondsDisplay`.
- `TournamentDetail`:
  - Shows countdown for the **pending match** relevant to the current user.
  - If `status === 'running'`:
    - Shows "Match starts in N seconds" overlay.
  - If `status === 'cancelled'` (offline/forfeited/stopped):
    - Clears countdown and triggers a bracket refresh via `refreshTournamentState`.

### 5.3 ACCEPT_SCHEDULED

Clients can send:

```jsonc
{ "type": "ACCEPT_SCHEDULED", "tournamentMatchId": <id> }
```

`handleAcceptScheduled`:

- Checks that:
  - A `PendingTournamentMatch` exists for this match.
  - The client is one of the participants.
- Calls `handleSingleTournamentMatch` again, effectively re‑evaluating availability and restarting countdown if necessary.

The UI can expose this as “I’m ready” confirmation, though the countdown logic is designed to work even without manual acceptance.

---

## 6. From countdown to handoff to game

Once a countdown completes and both players are present, matchmaking turns the tournament match into an actual game match.

### 6.1 Launching the match

When the countdown time arrives and availability is good:

- `finalizeTournamentMatchLaunch(pending, playerClients, clients)`:
  - Emits a final `TOURNAMENT_MATCH_COUNTDOWN` with `status: 'started'`.
  - Clears countdown and absence timers.
  - Uses `createMatch(playerA, playerB, 'ranked', { tournament: TournamentContext })`:
    - The `TournamentContext` is attached so allocator/game server know:
      - `tournamentId`
      - `tournamentMatchId`
      - `stage` (`semifinal`, `final`, `bronze`)

The match creation path is the **same as for casual/online matches**, but with `tournament` metadata.

### 6.2 HANDOFF to tournament match

`createMatch` (in `queue.ts`):

- Talks to allocator, which:
  - Registers a room on a game node.
  - Mints per‑player join tokens that include the `TournamentContext`.
- Sends a `HANDOFF` message to each player:

```jsonc
{
  "type": "HANDOFF",
  "matchId": "<matchId>",
  "roomIdentifier": "<roomIdentifier>",
  "gameServerWSUrl": "<endpointUrl>",
  "side": "west" | "east",
  "joinToken": "<joinToken>",
  "joinTokenTTLSeconds": 60,
  "randomSeed": <randomSeed>,
  "simulationStartTick": <timestamp>,
  "tournament": {
    "tournamentId": <id>,
    "tournamentMatchId": <matchId>,
    "stage": "semifinal" | "final" | "bronze"
  }
}
```

Frontend behavior (tournament controller):

- `routeMessage` sees the `HANDOFF` and:
  - Sets an `ActiveHandoff` in state (`setHandoff`).
  - Switches `matchPhase` to `'starting'`.
- `useMatchLifecycle`:
  - Uses the handoff to bootstrap the online Pong host (same as `/pong/online`).
  - Connects to `/g/:roomId` using the join token.
  - Shows the in‑match canvas view during `'starting'` and `'playing'`.

From here, the flow is essentially the same as a casual match:

- See `OnlinePongNetwork.md`, `OnlinePongDataPlane.md`, and `OnlinePongReconnect.md`.

---

## 7. In‑match behavior and reconnects (tournament perspective)

Tournament matches reuse the same game server and reconnect logic, with a few tournament‑specific tweaks:

- Join tokens and resume tokens include tournament context:
  - Game server knows `tournamentId` and `tournamentMatchId` for each session.
- Reconnect grace is usually **longer** for tournaments:
  - `reconnectGraceMs(true, cfg)` is used when `session.reservation.tournament` is set.
  - This affects:
    - `OPPONENT_DISCONNECTED` grace windows.
    - How long the player has to resume before timeout/forfeit.
- Auto‑resume on the frontend:
  - `useTournamentPageController` uses `findAnyStoredResumeCandidate({ tournamentOnly: true, tournamentId })` to auto‑resume in‑progress tournament matches when returning to the tournament detail view.
  - This is analogous to auto‑resume for `/pong/online`, but scoped to the tournament page.

On the wire:

- Data plane (FRAME/ROOM_STATE/START) is identical to online matches.
- Control messages (`RESUME_TOKEN`, `OPPONENT_*`, `MATCH_END`) behave the same, but matches are tied back into a tournament bracket using the tournament context.

---

## 8. MATCH_END and bracket update

When a tournament match finishes:

- Game server’s `ResultReporter` calls a **tournament result endpoint** on the backend (see `ResultsAndRanking.md` and `BackendAndAPIs.md`):
  - Includes:
    - `tournamentId`
    - `tournamentMatchId`
    - Winner and scores.
  - Backend:
    - Updates the tournament bracket (mark match as completed).
    - Advances the winner to the appropriate next round.
    - Writes match history and stats as usual.

Matchmaking is then notified via the tournament bridge (Redis streams / `MatchmakingRedisBridge`):

- `handleTournamentStateUpdated({ tournamentId })`:
  - Calls `requestTournamentSync`.
  - `syncTournamentState` fetches the latest bracket and lobby state.
  - Broadcasts:
    - `TOURNAMENT_LOBBY_UPDATED`.
    - `TOURNAMENT_BRACKET_SNAPSHOT`.

Frontend behavior:

- The view updates to show:
  - Completed match with scores.
  - Winner advanced in the bracket.
  - Tournament status progressing toward completion (e.g. from semifinal to final).

---

## 9. Summary – user journey recap

Putting it all together, the typical user journey for a tournament looks like:

1. **Browse tournaments**
   - Visit `/pong/tournaments`.
   - Frontend loads tournaments via HTTP and subscribes to `/matchmaking`.

2. **Create or join a tournament**
   - Send `CREATE_TOURNAMENT` or `JOIN_TOURNAMENT`.
   - Matchmaking calls backend, sets `IN_TOURNAMENT`, and broadcasts `TOURNAMENT_LOBBY_UPDATED` + `TOURNAMENT_BRACKET_SNAPSHOT`.

3. **Wait in lobby / watch bracket**
   - Lobby and bracket updates arrive over WebSocket.
   - Frontend renders participant list and matches by stage.

4. **Receive a scheduled match**
   - Backend + matchmaking decide a match is ready.
   - Players receive `TOURNAMENT_MATCHES_READY` and `TOURNAMENT_MATCH_COUNTDOWN` as the start approaches.

5. **Countdown and readiness**
   - Countdown runs; both players must be present in `/matchmaking`.
   - If someone is absent or forfeits:
     - Countdown cancels; auto‑forfeit logic may apply; state updates.

6. **Match handoff and gameplay**
   - When conditions are good, matchmaking calls allocator and sends `HANDOFF` with tournament context.
   - Frontend bootstraps an online match using the same host as `/pong/online`.
   - Gameplay, reconnects, and latency handling are identical to casual matches.

7. **Match end and bracket update**
   - Game server reports tournament result to backend.
   - Backend updates bracket and pushes a state update; matchmaking broadcasts `TOURNAMENT_LOBBY_UPDATED` + `TOURNAMENT_BRACKET_SNAPSHOT`.
   - Frontend bracket view updates, and the player either moves on to the next round or is eliminated.

For deeper details, follow the links in `overview.md`, especially:

- `TournamentMatchmaking.md` for matchmaking internals.
- `TournamentMatchFlow.md` for the per‑match handoff and game server path.
- `ProtocolReference.md` for exact tournament message shapes.
