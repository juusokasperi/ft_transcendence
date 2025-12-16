# Failure Modes & UX – Online Pong End to End

This document consolidates the **error and failure flows** for online Pong and tournaments, across:

- Matchmaking (`/matchmaking`)
- Allocator + game server creation
- Gateway and join/resume tokens (`/g/:roomId`)
- Game server and data‑plane reconnects

For each class of failure, it describes:

- What happens on the wire (HTTP status, WS `ERROR` message, or close code).
- What the frontend does (state transitions, snackbars, retries).

Use this as an annex to:

- `OnlinePongNetwork.md` – happy‑path online flow.
- `OnlinePongDataPlane.md` – FRAME/tick behavior.
- `OnlinePongReconnect.md` – reconnect/resume logic.
- `TournamentNetworkFlow.md` – tournament flow.
- `DataFetchingAndErrors.md` – generic HTTP/Axios error patterns.

---

## 1. Matchmaking‑level failures (`/matchmaking`)

### 1.1 Auth failures

**Where:** `apps/matchmaking/auth/auth.ts` → `handleAuth` and `extractToken`.  
**Wire behavior:**

- If the `token` cookie is missing or invalid:
  - Matchmaking sends an `ERROR` message:

    ```jsonc
    { "type": "ERROR", "code": "AUTH", "message": "Token missing" | "Invalid token" }
    ```

**Frontend behavior:**

- In `useMatchmakingClient`:
  - `ERROR` with `code === 'AUTH'` triggers:
    - `dispatch({ type: 'authError' });`
    - `onAuthError(msg.message)` (provided by `OnlineGame.tsx`).
- In `OnlineGame.tsx` (`handleAuthError`):
  - If `message === 'Token expired'`:
    - Calls `POST /api/auth/refresh` via Axios:
      - On success: bumps `connectKey` to reconnect matchmaking.
      - On failure: falls through to logout.
  - Shows a snackbar:
    - Message: `message ?? 'Authentication error. Please sign in again.'`.
    - Variant: `'error'`.
  - Clears `user` in `AppContext` (user is effectively logged out).

**State impact:**

- Online state machine (`online/state/machine.ts`):
  - `authError` action resets state to `'connecting'` with empty matchmaking state.

### 1.2 Allocator / game‑server capacity errors

**Where:**

- Matchmaking → allocator (`createMatch` in `apps/matchmaking/utils/queue.ts`).
- Allocator or game server errors (HTTP failures).

**Wire behavior:**

- On allocator failure inside `createMatch`:
  - Matchmaking sends an `ERROR` to both players:

    ```jsonc
    {
      "type": "ERROR",
      "code": "ALLOCATOR",
      "message": "Game servers are currently busy, try again later.",
    }
    ```

**Frontend behavior:**

- In `useMatchmakingClient`:
  - `ERROR` with `code === 'ALLOCATOR'`:
    - Dispatches `allocatorError` → resets state to `'idle'`.
    - Calls `onAllocatorError(msg.message)`.
- In `OnlineGame.tsx` (`handleAllocatorError`):
  - Shows snackbar:
    - Message: server’s message or default:
      - `"No available game servers right now. Please try again shortly."`
    - Variant: `'error'`.

**UX summary:**

- User is dropped back to idle online lobby.
- A clear message explains that servers are busy.

### 1.3 Rate limiting

**Where:** `isRateLimited` in `apps/matchmaking/utils/ratelimit.ts`.  
**Wire behavior:**

- If the Redis token bucket denies the action:
  - Matchmaking sends:

    ```jsonc
    {
      "type": "ERROR",
      "code": "RATELIMIT",
      "message": "You are sending messages too fast. Please try again shortly.",
    }
    ```

**Frontend behavior:**

- In `useMatchmakingClient`:
  - `ERROR` with `code === 'RATELIMIT'`:
    - Dispatches `ratelimitError` (no major state change).
    - Calls `onRatelimit(msg.message)`.
- In `OnlineGame.tsx` (`handleRatelimit`):
  - Shows snackbar with `message` or default:
    - `"You are sending messages too fast. Please try again shortly."`
    - Variant: `'error'`.

**UX summary:**

- Online state does not reset; user simply sees a warning and can try again after a short delay.

### 1.4 Queue and pending‑match timeouts

**Where:**

- `PendingMatch` timers in `apps/matchmaking/utils/queue.ts`.

**Wire behavior:**

- If players do not accept a match in time:
  - Matchmaking sends:

    ```jsonc
    { "type": "MATCH_TIMEOUT" }
    ```

**Frontend behavior:**

- `useMatchmakingClient`:
  - On `MATCH_TIMEOUT`:
    - Dispatches `matchTimeout` (state reset to `'idle'`).
    - Calls optional `onMatchTimeout()`.
- `OnlineGame.tsx`:
  - `handleMatchTimeout` shows snackbar:
    - `"Pending match timed out."`
    - Variant: `'error'`.

**UX summary:**

- User is moved back to idle lobby and informed that the match timed out.

### 1.5 Match declined

**Wire behavior:**

- When the opponent declines a match:

  ```jsonc
  { "type": "MATCH_DECLINED", "matchId": "…" }
  ```

**Frontend behavior:**

- `useMatchmakingClient`:
  - Dispatches `matchDeclined` (state reset to `'idle'`).
  - Calls `onMatchDeclined()`.
- `OnlineGame.tsx`:
  - `handleMatchDeclined` shows snackbar:
    - `"Match declined or unavailable."`
    - Variant: `'error'`.

---

## 2. Gateway and join/resume token failures (`/g/:roomId`)

### 2.1 Join token errors

**Where:**

- Gateway: `apps/game-gateway/index.ts` (validates join tokens and room mapping).
- Game server: `WSServer.handleJoinConnection` validates join tokens, reservation, and join window.

**Close codes (`CLOSE_CODES` in `protocol/net.ts`):**

- `MISSING_TOKEN: 4401` – no `bearer` token in subprotocols.
- `INVALID_TOKEN: 4401` – token fails verification or claims invalid.
- `TOKEN_REUSED: 4403` – join token already consumed.
- `PLAYER_NOT_AUTHORIZED: 4403` – token subject not expected for this room.
- `SEAT_OCCUPIED: 4402` – seat already has a player.
- `SIDE_MISMATCH: 4403` – token side doesn’t match expected seat.
- `JOIN_WINDOW_EXPIRED: 4408` – `joinDeadlineAtEpochMs` passed.
- `ROOM_NOT_FOUND: 4404` – no reservation/session for room.
- `MATCH_FINISHED: 4410` – match already completed.
- `SERVER_ERROR: 1011` – internal error when processing token or room.

**Wire behavior:**

- On any of these conditions, the gateway or game server closes the WebSocket with the corresponding code and reason string (e.g. `'invalid-token'`, `'room-not-found'`).

**Frontend behavior:**

- In `connectOnline.ts`:
  - `PERMANENT_CLOSE_CODES = new Set(Object.values(CLOSE_CODES))`.
  - If the socket closes **before open** with one of these codes:
    - The `Promise<OnlineClient>` is rejected with `Error('WebSocket closed (code)')`.
  - If it closes **after open** with a permanent code:
    - Reconnect logic (`createReconnector`) treats it as terminal:
      - Stops attempting resume.
      - Calls `onPermanentClose`, which:
        - Triggers `MATCH_END` event with synthetic reason `'connection_closed'` and `summary: null`.
        - Clears stored resume tokens for this room.

**UX summary:**

- The user typically sees:
  - Failed bootstrap into the match (e.g. match never starts), or
  - A sudden “connection_closed” match end.
- The React side (`useOnlineMatchEnd` / tournament match lifecycle) interprets `'connection_closed'` as:
  - Show an error snackbar (“Connection to game server lost” or similar).
  - Return the user to a safe screen (online lobby or tournament detail).

### 2.2 No room mapping in Redis

**Where:**

- Gateway: lookup of `room-to-node:<roomId>` fails.

**Wire behavior:**

- Gateway typically responds with:
  - HTTP error on upgrade or closes the socket with `ROOM_NOT_FOUND` (4404) or `SERVER_ERROR` (1011), depending on exact path.

**Frontend behavior:**

- Same as any permanent close code:
  - `connectOnline` rejects or the reconnector emits a `'connection_closed'` match end.
  - UI shows connection lost error and returns user to lobby.

---

## 3. Game‑server data‑plane failures and reconnects

### 3.1 Resume token failures

**Where:**

- Game server: `WSServer.handleResumeConnection` and `ResumeTokenService.consume`.

**Wire behavior:**

- If resume token is invalid (signature, iss/aud, mismatched room, replayed jti, expired):
  - Game server closes with:
    - `INVALID_TOKEN` (4401) – invalid or replayed token.
    - `ROOM_NOT_FOUND` (4404) – no session for `roomIdentifier`/`sessionIdentifier`.
    - `MATCH_FINISHED` (4410) – match already completed.

**Frontend behavior:**

- `createReconnector`:
  - If close during resume is a **policy close** (codes 4400–4499) or if there are multiple pre‑open failures:
    - Calls `onResumeGiveUp('rejected')`.
    - Clears resume tokens and stops ping loop.
  - If permanent (`isPermanentClose(evt.code)`) after open:
    - Calls `onPermanentClose` → `'connection_closed'` match end.

**UX summary:**

- If resume fails:
  - The match is treated as over from the client’s perspective.
  - User remains on lobby/tournament screen and sees a reconnect failure snackbar if they were mid‑match.

### 3.2 Opponent timeout during reconnect

**Where:** `ReconnectManager` on game server.

**Wire behavior:**

- When a player disconnects from an active match:
  - Remaining player receives `OPPONENT_DISCONNECTED` with `gracePeriodMs`.
  - If the missing player does not reconnect within grace:
    - Game server reports result with reason `'timeout'`.
    - `Broadcaster.notifyMatchEnd` sends:

      ```jsonc
      { "type": "MATCH_END", "reason": "opponent_timeout", "winner": "east" | "west", "summary": { … } }
      ```

**Frontend behavior:**

- Online:
  - The in‑match overlay shows opponent disconnect countdown (from `OPPONENT_DISCONNECTED`).
  - On `MATCH_END` with reason `'opponent_timeout'`:
    - `useOnlineMatchEnd`:
      - Shows a snackbar like “Opponent disconnected.”
      - Transitions state to `'postmatch'`.
- Tournament:
  - `useMatchLifecycle` behaves similarly, then triggers `refreshTournamentState` to update bracket.

### 3.3 Explicit forfeit

**Wire behavior:**

- Client sends `{ type: 'forfeit' }`.
- Game server:
  - Ends match with reason `'forfeit'`.
  - Sends:

    ```jsonc
    { "type": "MATCH_END", "reason": "forfeit", "winner": "east" | "west", "summary": { … } }
    ```

**Frontend behavior:**

- Online:
  - `handleQuit` in `OnlineGame`:
    - Calls `forfeit()` on the online client.
    - Clears resume tokens and prevents auto‑resume.
  - `useOnlineMatchEnd`:
    - Shows appropriate snackbar:
      - “You forfeited” or “Opponent forfeited”, depending on perspective.
    - Moves to `'postmatch'` and then back to menu.
- Tournament:
  - `handleQuitMatch` behaves similarly but also:
    - Clears tournament‑scoped resume tokens.
    - Refreshes tournament state so bracket reflects the result.

---

## 4. Tournament‑specific failure flows

### 4.1 Tournament API errors

**Where:**

- Matchmaking’s tournament handlers (`scheduledMatches.ts`) calling backend APIs.

**Wire behavior:**

- On HTTP failures when creating/joining/leaving/forfeiting tournaments:
  - Matchmaking sends:

    ```jsonc
    { "type": "ERROR", "code": "TOURNAMENT_API" | "TOURNAMENT_INVALID" | "TOURNAMENT_LIMIT", "message": "…" }
    ```

**Frontend behavior:**

- Tournament hooks (`useTournamentPageController` + router handlers):
  - Show snackbars with the provided message, e.g.:
    - “Failed to create tournament.”
    - “Tournament identifier is invalid.”
    - “You already have a tournament in progress.”
  - Keep or reset local active tournament state depending on context.

### 4.2 Countdown cancellations and auto‑wins

**Wire behavior:**

- `TOURNAMENT_MATCH_COUNTDOWN` with:
  - `status: 'cancelled'`
  - `reason: 'offline' | 'forfeited' | 'stopped'`

**Frontend behavior:**

- `useMatchCountdown`:
  - Removes countdown for cancelled matches.
- `useTournamentPageController`:
  - Uses `refreshTournamentState` to update bracket once the backend applies auto‑wins or forfeits.
- UX:
  - Player may see messages like “Opponent offline” or “Opponent forfeited”, depending on how the handlers surface the `reason` (snackbar or label).

---

## 5. HTTP data‑fetching failures (backend APIs)

For standard REST APIs (user profile, stats, tournaments list, etc.), failures are handled as described in `DataFetchingAndErrors.md`:

- Axios errors:
  - For non‑auth errors:
    - Components often set an `error` string and show inline messages (“Failed to load stats”).
    - Sometimes display snackbars (e.g. tournament list errors).
  - For auth‑specific 401s:
    - Axios interceptor attempts token refresh once.
    - On failure, logs out and navigates to `/`.

In the context of online Pong:

- Tournament pages:
  - If tournament state fetch fails, `useActiveTournament`:
    - Shows a snackbar like “Failed to refresh tournament state”.
    - Keeps prior state where possible, so the UI remains usable.

---

## 6. Quick reference table (by layer)

This is a quick map from **layer** → **visible effect**:

- **Matchmaking (`/matchmaking`):**
  - Auth: `ERROR AUTH` → snackbar + logout; state reset.
  - Allocator busy: `ERROR ALLOCATOR` → snackbar “Game servers busy”; state → idle.
  - Ratelnit: `ERROR RATELIMIT` → snackbar; no state reset.
  - Queue/match timeout: `MATCH_TIMEOUT` → snackbar “Pending match timed out”; state → idle.
  - Match declined: `MATCH_DECLINED` → snackbar “Match declined or unavailable”; state → idle.

- **Gateway / join window / room mapping (`/g/:roomId`):**
  - Missing/invalid/reused token, join window expired, room not found, match finished:
    - WS close with codes 4401/4402/4403/4404/4408/4410.
    - Online host reports `'connection_closed'` match end.
    - UI shows connection lost error and returns to lobby/detail page.

- **Game server data plane:**
  - Resume token invalid/expired:
    - Resume attempt fails; reconnector gives up.
    - If no other failure, host eventually treats this as a closed connection; UX is similar to gateway failure.
  - Opponent never reconnects:
    - `MATCH_END` with reason `'opponent_timeout'`.
    - UI shows “Opponent disconnected” and displays post‑match summary.
  - Explicit forfeit:
    - `MATCH_END` with reason `'forfeit'`.
    - UI shows “You forfeited” / “Opponent forfeited” and returns to menu.

- **Tournament control plane:**
  - API errors: `ERROR` with tournament codes → snackbars; state may remain stale until a later refresh.
  - Countdown cancelled (`TOURNAMENT_MATCH_COUNTDOWN` with `status: 'cancelled'`) → countdown removed; bracket refresh requested.
  - Auto‑win/forfeit: handled via backend API + state sync; user sees bracket updates and may get tournament‑specific snackbars.

When extending error handling, follow these patterns:

- Use `ERROR.code` and close codes to distinguish **recoverable** vs **terminal** failures.
- Always map failures to:
  - A clear **state machine transition**.
  - A user‑facing message when the failure is relevant to the user’s current action.
