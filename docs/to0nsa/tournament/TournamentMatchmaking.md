# Tournament Matchmaking – Membership, Scheduling, and Messages

This document explains how the **matchmaking service** (`apps/matchmaking`) handles tournaments:

- Tournament membership and subscriptions.
- HTTP calls to backend tournament APIs.
- How scheduled matches turn into WebSocket messages and handoffs.

It complements:

- `TournamentNetworkFlow.md` – player‑centric view.
- `TournamentFrontend.md` – React pages and hooks.
- `TournamentMatchFlow.md` – per‑match handoff and game integration.
- `MatchmakingService.md` – overall matchmaking design (queues, invites, tournaments).

---

## 1. State and registries

Tournament logic lives mostly in `apps/matchmaking/utils/scheduledMatches.ts`, backed by:

- `ClientInfo` and `ClientState` (`apps/matchmaking/types/types.ts`):
  - `ClientState.IN_TOURNAMENT` marks a client as participating in a tournament.
  - `client.tournamentId` and `client.tournamentParticipantId` track membership.
  - `client.siteToken` holds a backend JWT for calling tournament APIs.

- In‑memory structures:
  - `scheduledTournamentMatches: Set<number>` – matches already launched.
  - `pendingTournamentMatches: Map<number, PendingTournamentMatch>` – matches that are ready or counting down.
  - `tournamentSubscribers: Map<number, Set<string>>` – client IDs subscribed to a specific tournament.

- Membership registry helpers (`tournamentMembershipRegistry.ts`):
  - `setTournamentMembership`, `clearTournamentMembership`, `syncTournamentMembershipSnapshot`.
  - Allow other parts of the system to quickly answer “is this user in a tournament?”.

Key config values (`apps/matchmaking/utils/config.ts`):

- `TOURNAMENT_MATCH_AUTO_START_DELAY_MS` – how long after matches become ready the system tries to auto‑start them.
- `TOURNAMENT_MATCH_COUNTDOWN_INTERVAL_MS` – countdown tick frequency.
- `TOURNAMENT_MAX_REMINDERS`, `TOURNAMENT_REMINDER_DELAY_MS` – how often to remind when someone is missing.
- `TOURNAMENT_ABSENCE_AUTO_WIN_MS` – extra window after a missed match before auto‑forfeit.

---

## 2. Tournament membership (join/leave/forfeit)

Tournament‑related client commands (see `ProtocolReference.md`):

- `CREATE_TOURNAMENT`
- `JOIN_TOURNAMENT`
- `LEAVE_TOURNAMENT`
- `FORFEIT_TOURNAMENT`

### 2.1 Creating a tournament

`handleCreateTournament(data, client, clients)`:

- Requires:
  - `client.authenticated === true`.
  - `client.siteToken` present.
- Uses `extractSiteToken` to pull a JWT and call backend:
  - `GET /api/tournaments/my/active` – to enforce one active tournament per user.
  - If active tournament exists:
    - Sets client membership to that tournament.
    - Sends an `ERROR { code: 'TOURNAMENT_LIMIT' }`.
    - Calls `syncTournamentState` to show the existing tournament.
    - Returns.
  - Otherwise:
    - `POST /api/tournaments` – create new tournament.
    - `POST /api/tournaments/:id/participants` – register user with alias.
- Updates local state:
  - `client.tournamentId`, `client.tournamentParticipantId`.
  - `ClientState.IN_TOURNAMENT`.
  - `trackClientTournamentMembership` to mirror in the registry.
  - `subscribeClientToTournament(tournamentId, client)` so the client receives tournament messages.
- Calls `syncTournamentState` to broadcast:
  - `TOURNAMENT_LOBBY_UPDATED`.
  - `TOURNAMENT_BRACKET_SNAPSHOT`.

### 2.2 Joining a tournament

`handleJoinTournament(data, client, clients)`:

- Validates:
  - `data.tournamentId` is a positive number.
- Uses `extractSiteToken` to call backend:
  - `POST /api/tournaments/:id/participants` with `{ alias, userUuid }`.
- Updates:
  - `client.tournamentId`, `client.tournamentParticipantId`.
  - `ClientState.IN_TOURNAMENT`.
  - Subscriptions and membership registry.
- Calls:
  - `syncTournamentState` to broadcast lobby and bracket.
  - `checkPendingMatchesForPlayer` to resync any existing ready matches for this player.

### 2.3 Leaving a tournament

`handleLeaveTournament(client, clients)`:

- If no active membership → logs and returns.
- Calls backend:
  - `DELETE /api/tournaments/:id/participants/:participantId`.
- Cancels any pending matches involving this player:
  - For each `PendingTournamentMatch` where `participant.userUuid === client.uuid`:
    - Cancels countdown (`cancelTournamentCountdown`: `status: 'cancelled', reason: 'forfeited'`).
    - Clears reminder timers and removes from `pendingTournamentMatches`.
- Calls `syncTournamentState` to broadcast the updated state.
- Unsubscribes and clears membership:
  - `unsubscribeClientFromTournament`.
  - Clears `client.tournamentId`, `client.tournamentParticipantId`, and registry entry.
  - Sets `ClientState.IDLE`.

### 2.4 Forfeiting a tournament

`handleForfeitTournament(client, clients)`:

- Similar to leaving, but uses `PATCH`:
  - `PATCH /api/tournaments/:id/participants/:participantId` with `{ status: 'forfeited' }`.
- Cancels pending matches involving this player and updates tournament state.

From the user perspective:

- Leave vs forfeit differ at the bracket level:
  - Forfeit usually marks them as eliminated (and may award auto‑wins).
  - Leave semantics can differ depending on implementation and UI messaging.

---

## 3. Subscriptions and state sync

Tournament state is maintained server‑side in the backend; matchmaking acts as a **fan‑out** layer for real‑time updates.

### 3.1 Subscriptions

Helpers:

- `subscribeClientToTournament(tournamentId, client)`:
  - Adds `client.id` to `tournamentSubscribers[tournamentId]`.

- `unsubscribeClientFromTournament(tournamentId, clientId)`:
  - Removes `clientId` and prunes empty sets.

Tournament messages are broadcast via:

- `broadcastToTournament(tournamentId, clients, payload)`:
  - Sends the payload to all subscribing clients.

### 3.2 Syncing state from backend

`syncTournamentState(tournamentId, authClient, clients)`:

- Uses `extractSiteToken(authClient)` and `fetchTournamentState` to call:
  - `GET /api/tournaments/:id`
  - `GET /api/tournaments/:id/participants`
  - `GET /api/tournaments/:id/matches`
  - For each match, `GET /api/tournaments/:id/matches/:matchId/players`, and optionally `GET /api/matches/:match.matchId` for scores.
- Builds:
  - `TournamentLobbyUpdatedMessage`.
  - `TournamentBracketSnapshotMessage`.
- Calls:
  - `syncTournamentMembershipSnapshot` to keep membership registry up to date.
  - `broadcastToTournament` with both messages.

### 3.3 Triggers for state sync

State is refreshed when:

- New matches are ready (`handleTournamentMatchesReady` → `requestTournamentSync(..., 'matches_ready')`).
- Backend signals generic state updates (`handleTournamentStateUpdated`).
- Membership changes (join/create/leave/forfeit) succeed.

This keeps:

- Frontend list and detail views consistent with backend truth.
- Matchmaking’s view of who’s in which tournament synchronized.

---

## 4. Scheduled matches and countdowns

The core of tournament matchmaking is in the handling of **scheduled matches** sent from the backend.

### 4.1 Pending tournament matches

`PendingTournamentMatch`:

- Includes:
  - `tournamentId`
  - `match` (from `TournamentMatchesReadyMessage.matches[]`)
  - `reminder?: NodeJS.Timeout`
  - `attempts` – how many reminders have been sent.
  - `countdown` – timers and last status for `TOURNAMENT_MATCH_COUNTDOWN`.
  - `absenceTimeout` – timer for absence auto‑win logic.

Stored in:

- `pendingTournamentMatches: Map<tournamentMatchId, PendingTournamentMatch>`.

### 4.2 Handling TOURNAMENT_MATCHES_READY

When the bridge notifies matchmaking about ready matches:

- `handleTournamentMatchesReady(payload, clients)`:
  - For each match:
    - Calls `handleSingleTournamentMatch(match, payload.tournamentId, clients)`.

`handleSingleTournamentMatch`:

- Ensures:
  - Match has exactly 2 participants.
  - Not already in `scheduledTournamentMatches`.
- Looks up or creates a `PendingTournamentMatch`.
- Evaluates availability via `evaluatePlayerAvailability`:
  - Resolves clients for both participants.
  - Checks they’re connected and `client.tournamentId === tournamentId`.

Cases:

- **Both present**:
  - Sends `TOURNAMENT_MATCHES_READY` directly to those clients.
  - Starts countdown via `startTournamentCountdown`.
  - In parallel, checks if anyone is already `forfeited` and cancels countdown if so.

- **Missing player(s)**:
  - Cancels any running countdown (`cancelTournamentCountdown`).
  - If exactly one is missing and one is present:
    - Schedules absence auto‑win via `scheduleAbsenceAutoWin`.
  - Schedules a reminder via `scheduleTournamentReminder`.

### 4.3 Countdown and absence auto‑win

`startTournamentCountdown(pending, clients)`:

- Initializes a countdown with:
  - Target start time.
  - Interval timer:
    - Emits `TOURNAMENT_MATCH_COUNTDOWN` with `status: 'running'` and decreasing `secondsRemaining`.
  - Execution timer:
    - At `targetStartEpochMs + TOURNAMENT_MATCH_AUTO_START_DELAY_MS`:
      - Re‑evaluates availability.
      - If both present:
        - Calls `finalizeTournamentMatchLaunch`.
      - Else:
        - Cancels countdown (`status: 'cancelled', reason: 'offline'`).
        - Possibly schedules `scheduleAbsenceAutoWin`.
        - Schedules another reminder.

`scheduleAbsenceAutoWin(pending, clients, missingUserUuid)`:

- After `TOURNAMENT_ABSENCE_AUTO_WIN_MS`:
  - Re‑evaluates availability.
  - If still exactly one player present and one missing:
    - Calls `autoForfeitParticipant`:
      - Uses a **match service token** (signed with `MATCH_SECRET`) to call:
        - `POST /api/tournaments/:tournamentId/participants/:participantId/auto-forfeit`.
      - Then calls `requestTournamentSync` to refresh bracket.

This mechanism ensures:

- Tournaments can progress even if one participant never shows up for their match.

---

## 5. Client disconnects and re‑joins

`handleClientDisconnectFromTournament(client, clients)`:

- Unsubscribes client from their current tournament.
- For any `PendingTournamentMatch` involving this client:
  - Cancels countdown (`status: 'cancelled', reason: 'offline'`).
  - Clears reminder timers.
  - Schedules a reminder (`scheduleTournamentReminder`) so the match is retried when players reappear.

`restoreTournamentMembership(client, clients)`:

- Called when a client reconnects to `/matchmaking`.
- Uses the site token to call:
  - `GET /api/tournaments/my/active`.
- If an active membership is found:
  - Sets `client.tournamentId` & `client.tournamentParticipantId`.
  - Sets `ClientState.IN_TOURNAMENT`.
  - Subscribes to tournament and syncs state.
  - Calls `checkPendingMatchesForPlayer`:
    - Checks if there is a pending match for this user.
    - If yes, re‑runs `handleSingleTournamentMatch` to resend notifications and countdowns.

From the user’s point of view:

- Closing and reopening the browser should restore:
  - Tournament membership.
  - Bracket view.
  - Any pending matches and countdowns, as long as the tournament is still active.

---

## 6. Tournament messages summary

This summarizes the key tournament‑related messages handled by matchmaking (see `ProtocolReference.md` for exact types):

- Client → Matchmaking:
  - `CREATE_TOURNAMENT` – create a new tournament and auto‑join.
  - `JOIN_TOURNAMENT` – join an existing tournament.
  - `LEAVE_TOURNAMENT` – leave the current tournament.
  - `FORFEIT_TOURNAMENT` – mark participation as forfeited.
  - `ACCEPT_SCHEDULED` – explicitly confirm readiness for a scheduled match (optional).

- Matchmaking → Client:
  - `TOURNAMENT_LOBBY_UPDATED` – lobby snapshot (status, maxParticipants, participants).
  - `TOURNAMENT_BRACKET_SNAPSHOT` – bracket snapshot (matches with players and scores).
  - `TOURNAMENT_MATCHES_READY` – per‑match notification that a match is ready soon.
  - `TOURNAMENT_MATCH_COUNTDOWN` – countdown updates, cancellations, started events.
  - `HANDOFF` – when the match is ready to be played as a Pong game.
  - Generic `ERROR` messages with tournament‑specific codes:
    - `TOURNAMENT_API`, `TOURNAMENT_LIMIT`, `TOURNAMENT_INVALID`, etc.

Understanding how these messages map to frontend handlers in `TournamentFrontend.md` and to backend APIs in `BackendAndAPIs.md` will give you a full picture of the tournament control plane.

