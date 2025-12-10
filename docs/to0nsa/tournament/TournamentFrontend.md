# Tournament Frontend – Pages, Hooks, and Messages

This document explains how the **React frontend** implements the tournament experience, and how it consumes tournament messages and handoffs.

It complements:

- `TournamentNetworkFlow.md` – big‑picture user/network flow.
- `TournamentMatchmaking.md` – matchmaking internals.
- `TournamentMatchFlow.md` – per‑match handoff and game integration.
- `OnlinePongNetwork.md` – generic online flow reused by tournament matches.

---

## 1. Pages and overall structure

Tournament UI lives under `apps/frontend/src/pages/pong/tournament/`:

- `TournamentPage.tsx` – route `/pong/tournaments`:
  - Shows:
    - List of tournaments.
    - “Create tournament” form.
    - “Join tournament” buttons.
  - Uses `useTournamentPageController` to drive everything.

- `TournamentDetail.tsx` – route `/pong/tournaments/:id`:
  - Shows details for a single tournament:
    - Header: name, status, participant count.
    - Bracket view and matches by stage.
    - In‑page match area (canvas) when the player is in an active match.
  - Also uses `useTournamentPageController` with a `focusTournamentId`.

Both pages:

- Share the same controller and state reducer.
- Differ mostly in layout and whether they’re focused on one tournament or the list.

---

## 2. Central controller: `useTournamentPageController`

`useTournamentPageController` is the **brain** of the tournament UI.

Responsibilities:

- Manage:
  - Connection to `/matchmaking`.
  - Tournament lobby and bracket state.
  - List of available tournaments.
  - Pending/active matches and match phase.
  - Bootstrapping the Pong match canvas for tournament games.
- Expose a simple API to pages:
  - `availableTournaments`, `activeTournamentId`, `tournamentStatus`, etc.
  - `handleCreateTournamentClick`, `handleJoinTournamentClick`, `handleLeaveTournamentClick`.
  - `matchesByStage`, `sortedParticipants`.
  - `matchPhase`, `canvasRef`, `handleQuitMatch`.

Internally it wires together:

- `useTournamentConnection` – WebSocket connection and reconnect logic.
- `useTournamentList` – HTTP list fetch and filtering.
- `useActiveTournament` – detailed state and refresh logic for a focused tournament.
- `useMatchCountdown` – countdown state derived from `TOURNAMENT_MATCH_COUNTDOWN`.
- `useMatchLifecycle` – handoff → online host → `MATCH_END` lifecycle.

State is stored in a reducer:

- `tournamentReducer` + `initialTournamentState`:
  - Tracks:
    - `availableTournaments`
    - `activeTournamentId`, `activeTournamentName`, `tournamentStatus`, `maxParticipants`
    - `participants`, `bracket`
    - `latestReadyMatches` (from `TOURNAMENT_MATCHES_READY`)
    - `matchCountdowns`
    - `pendingMatch` and `matchPhase`
    - `connectionReady` and `forfeitedParticipantIds`

---

## 3. WebSocket connection: `useTournamentConnection`

`useTournamentConnection` abstracts the tournament WebSocket:

- Wraps a `TournamentSocket` which internally uses `createMatchmakingClient`.
- Keeps refs for:
  - Connection state (`idle` | `connecting` | `open`).
  - Last disconnect time (for cooldown logic).
  - Backoff delay (using `DEFAULT_RECONNECT_DELAY` and `nextBackoffDelay`).
  - Whether the close was manual vs unexpected.
  - Whether an error snackbar has been shown.

On mount (user is signed in):

- Starts `TournamentSocket.connect` with handlers:
  - `onOpen`:
    - Resets backoff.
    - Marks connection as ready.
  - `onMessage`:
    - Forwards `MatchmakingMessage` to the controller’s `handleMessage`.
  - `onError` / `onClose`:
    - Schedules reconnect with backoff.
    - Shows snackbars on error / abnormal close.

On unmount:

- Cleans up timers.
- Closes the socket and clears refs.

It returns high‑level commands:

- `createTournament(size, name?)`
- `joinTournament(id)`
- `leaveTournament(id)`

These simply delegate to `TournamentSocket`, which in turn sends `CREATE_TOURNAMENT`, `JOIN_TOURNAMENT`, and `LEAVE_TOURNAMENT`.

---

## 4. Handling tournament messages: `routeMessage`

Incoming WebSocket messages (`MatchmakingMessage`) are routed through `routeMessage(msg, ctx)`:

- Message types include:
  - `TOURNAMENT_LOBBY_UPDATED`
  - `TOURNAMENT_BRACKET_SNAPSHOT`
  - `TOURNAMENT_MATCHES_READY`
  - `TOURNAMENT_MATCH_COUNTDOWN`
  - `HANDOFF` (for tournament matches)
  - Generic `CONNECTED` / `ERROR` messages.

The `MessageCtx` exposes helpers:

- Identity: `userUuid`.
- Navigation & path: `navigate`, `getPathname`.
- Snackbar: `enqueueSnackbar`.
- State getters/setters:
  - `getActiveTournamentId`, `setActiveTournamentId`, `resetActiveTournamentState`.
  - `setParticipants`, `setBracket`, `setLatestReadyMatches`.
  - `setMatchCountdowns`, `setMatchPhase`, `pendingMatchGet`/`pendingMatchSet`.
  - `setHandoff` for starting a match.
  - `setConnectionReady` for UI indicators.
  - `markForfeited` to track `forfeitedParticipantIds`.

`routeMessage` uses this context to:

- Keep the Redux‑like store in sync with the server.
- Trigger navigation in some cases (e.g. when a tournament ends while viewing its detail page).
- Start or stop countdowns based on `TOURNAMENT_MATCH_COUNTDOWN`.
- Prepare the `ActiveHandoff` when a tournament match handoff arrives.

From a reader’s perspective:

- Treat `routeMessage` as the **tournament version of `useMatchmakingClient`’s message switch**, but with more complex state updates for lobby and bracket.

---

## 5. Tournament list & detail hooks

### 5.1 `useTournamentList`

Purpose:

- Fetch and maintain the list of tournaments for `/pong/tournaments`.

Key behaviors:

- Uses Axios to call the backend tournament list endpoint.
- Provides:
  - `loadingTournaments`
  - `loadTournaments()` – reload the list.
  - `filterTournamentsForDisplay()` – hide tournaments that are irrelevant for the current view.

Ties into WebSocket events:

- When some actions happen (e.g. leaving a tournament), the controller calls `loadTournaments` so the list reflects the latest state (e.g. removed/cancelled tournaments).

### 5.2 `useActiveTournament`

Purpose:

- Manage the **focused** tournament for the detail view.

Key behaviors:

- Given a `focusTournamentId`, it:
  - Fetches that tournament’s state via backend APIs.
  - Sets `activeTournamentId`, `activeTournamentName`, `tournamentStatus`, `maxParticipants`.
  - Provides `refreshTournamentState` to re‑pull the data later.
- Handles:
  - “Tournament not found” → navigates back to `/pong/tournaments` and shows a warning snackbar.

This hook ensures:

- The detail page always has a reliable HTTP snapshot to go along with real‑time WebSocket updates.

---

## 6. Match lifecycle in the frontend

Tournament matches reuse the same **online Pong** match host and canvas that `/pong/online` uses, but controlled by tournament hooks.

### 6.1 Countdown display: `useMatchCountdown`

Inputs:

- `pendingMatch` – the match the UI considers about to start (from `TOURNAMENT_MATCHES_READY`).
- `matchCountdowns` – a map of countdowns per `tournamentMatchId` from `TOURNAMENT_MATCH_COUNTDOWN`.

Outputs:

- `countdownStatus` – e.g. `running`, `cancelled`, or `started` for the currently relevant match.
- `countdownSecondsDisplay` – remaining seconds for UX.

Used by:

- Tournament detail page to show countdown overlays or banners.

### 6.2 Handoff and in‑match view: `useMatchLifecycle`

Inputs:

- `matchPhase` – `'idle' | 'starting' | 'playing' | 'postmatch'` for tournament context.
- `handoff: ActiveHandoff | null` – when set, includes:
  - `matchId`
  - `roomIdentifier`
  - `gameServerWSUrl`
  - `joinToken`
  - `randomSeed`
  - `side`
  - (and implicitly, tournament context via `HandoffMessage`).
- Helpers:
  - `setMatchPhase`, `setHandoff`.
  - `canvasRef` for the game canvas.
  - `refreshTournamentState`, `enqueueSnackbar`, `debugLog`.

Behavior:

- When `handoff` is set and `matchPhase` is `'starting'`:
  - Bootstraps the online Pong host (like `useGameBootstrap` does for `/pong/online`).
  - Connects to `/g/:roomId` using `joinToken`.
  - Starts the match, moving `matchPhase` → `'playing'`.
- On `MATCH_END` from the game server:
  - Shows appropriate toast/snackbar.
  - Clears `handoff` and sets `matchPhase` → `'postmatch'` or `'idle'` as appropriate.
  - Triggers `refreshTournamentState` so the bracket updates.

This is the glue that makes **tournament matches feel like “embedded” online Pong games** inside the tournament detail page.

### 6.3 Quit & auto‑resume semantics

Controller provides `handleQuitMatch`, which:

- Sets a flag to skip auto‑resume.
- Clears any stored resume tokens for the relevant room.
- Delegates to `useMatchLifecycle`’s quit logic (e.g. sending a forfeit, unmounting the host).

Auto‑resume:

- A `useEffect` in `useTournamentPageController`:
  - If on a tournament detail route with a non‑completed tournament.
  - And the user has a valid resume token for a tournament match.
  - And `matchPhase` is not already starting/playing.
  - Then it seeds a synthetic handoff (roomId + `/g/:roomId`) and sets `matchPhase` to `'starting'`.
- This mirrors `/pong/online` auto‑resume behavior but is scoped to the tournament page.

---

## 7. Integration with global UI

Tournament matches also integrate with global app UI:

- `MatchActivityContext`:
  - `useTournamentPageController` sets `matchActive` when `matchPhase` is `'starting'` or `'playing'`.
  - This can be used to disable certain UI features (e.g. navigation, chat inputs) while in a match.

- Snackbar system:
  - All notable events (join/leave errors, connection issues, match ready, match ended) use `useSnackbar`.
  - Keeps user feedback consistent with online and invite flows.

---

## 8. Where to look next

If you’re working on frontend tournament behavior:

- Start here, then read:
  - `TournamentNetworkFlow.md` – to see how frontend events align with backend/matchmaking.
  - `TournamentMatchmaking.md` – to understand how messages and HTTP calls are generated server‑side.
  - `OnlinePongNetwork.md` and `OnlinePongReconnect.md` – for the in‑match host behavior that tournaments reuse.

