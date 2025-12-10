# Online Pong – Reconnect & Resume Internals

This document focuses on what happens when a **game WebSocket drops** during an online match:

- How resume tokens are rotated and stored.
- How the **client reconnector** behaves (`createReconnector` in `connect-online.ts`).
- How the game server’s **grace window** works (`ReconnectManager`).
- How control‑plane messages (`OPPONENT_DISCONNECTED`, `OPPONENT_RECONNECTED`, `MATCH_END`) map to UI states.

Read this alongside:

- `OnlinePongNetwork.md` – end‑to‑end online flow (queue → handoff → game → result).
- `OnlinePongDataPlane.md` – frames, ticks, latency, and reconnect grace from a data‑plane angle.
- `SecurityAndTokens.md` – token shapes and signing, especially **resume tokens**.
- `GameNode.md` – game‑server internals, including reconnect grace and result reporting.
- `ProtocolReference.md` – detailed message catalogue (`RESUME_TOKEN`, `OPPONENT_*`, `MATCH_END`, close codes).

---

## 1. Building blocks and key files

Code you’ll want open when reading this:

- Frontend:
  - `apps/frontend/src/games/pong/modes/online/connect-online.ts`
  - `apps/frontend/src/games/pong/modes/online/reconnect.ts`
  - `apps/frontend/src/games/pong/modes/online/resume.ts`
  - `apps/frontend/src/pages/pong/online/OnlineGame.tsx`
  - `apps/frontend/src/pages/pong/online/state/machine.ts`

- Game server:
  - `apps/game-server/src/app/ResumeTokenService.ts`
  - `apps/game-server/src/app/ReconnectManager.ts`
  - `apps/game-server/src/infra/ws/WSServer.ts`
  - `apps/game-server/src/app/Broadcaster.ts`
  - `apps/game-server/src/domain/Policies.ts`

- Shared protocol and close codes:
  - `packages/pong/shared/src/protocol/net.ts`

Conceptually, **reconnect** is a collaboration between:

- The game server, which:
  - Rotates resume tokens.
  - Starts/ends grace windows.
  - Publishes `OPPONENT_*` and `MATCH_END`.
- The gateway, which:
  - Accepts `Sec-WebSocket-Protocol: resume,<token>`.
  - Proxies to the right game node if the token is valid.
- The frontend, which:
  - Stores the latest resume token.
  - Runs a reconnection loop (`createReconnector`) when the socket closes.
  - Uses events to update the UI (disconnect banners, post‑match views).

---

## 2. Resume tokens: rotation and storage

The game server issues **single‑use, short‑lived resume tokens** while a player is connected.

### 2.1 Issuance and rotation on the game server

`ResumeTokenService.issue` (`apps/game-server/src/app/ResumeTokenService.ts`):

- Creates `ResumeTokenClaims` with:
  - `iss: 'game-server'`, `aud: 'game-server'`.
  - `roomIdentifier`, `sub` (player identifier), `sessionIdentifier`.
  - `iat`, `exp`, `jti`.
- Signs them with the realtime secret (`signResumeToken`).
- Stores `resume-token:<jti>` in Redis with TTL, `NX`:
  - Enforces **single use**.

`WSServer.bindPlayerConnection` (`apps/game-server/src/infra/ws/WSServer.ts`):

- For each seat:
  - Computes reconnect grace: `graceMs = reconnectGraceMs(isTournament, config)`.
  - Picks a rotation period: `rotatePeriod = max(3000, floor(graceMs / 3))`.
  - Calls `ResumeTokenService.issue` with `ttlMs = graceMs + rotatePeriod`.
  - Uses `Broadcaster.broadcastResumeToken` to send a `RESUME_TOKEN` message to the client.
  - Starts `player.resumeInterval = setInterval(rotate, rotatePeriod)` so tokens are **overlapping**:
    - New tokens are issued before previous ones expire.

Result:

- While connected, each player:
  - Regularly receives fresh `RESUME_TOKEN` messages.
  - Always has at least one valid token covering the next grace window.

### 2.2 Client‑side storage

On the client (`connect-online.ts`), when a `RESUME_TOKEN` arrives:

- The token is decoded via `readJwtExpSec` to discover `expSec`.
- A `latestResume = { token, expSec }` snapshot is kept in memory.
- `saveResumeTokenToSession` persists it in `sessionStorage`, keyed by `roomIdentifier` and tournament context:
  - This allows **page refresh** + resume within grace.

Important behaviors:

- If the game started from a **resume** token (not a fresh join), the token used to open the connection is considered **consumed**:
  - `usedResumeAtConnect === true`.
  - The client **waits** for the first `RESUME_TOKEN` rotation before trying to reconnect again.
- Resume tokens are cleared on:
  - `MATCH_END` messages.
  - Explicit `forfeit()`.
  - Certain permanent close codes (see below).

---

## 3. Client reconnect loop (`createReconnector`)

The reconnect logic lives in `apps/frontend/src/games/pong/modes/online/reconnect.ts` and is wired into `connect-online.ts`.

### 3.1 When the reconnector activates

In `connect-online.ts`:

- Before the socket opens:
  - `PERMANENT_CLOSE_CODES = new Set(Object.values(CLOSE_CODES))`.
  - If the WebSocket `close` event fires **before open**:
    - If we were using a resume token (`usedResumeAtConnect`):
      - Clear stored tokens for the room.
    - The connection attempt fails; no automatic fallback to join.
- After the socket opens successfully:
  - `createReconnector` is created with:
    - `resolvedUrl` (e.g. `/g/:roomId`).
    - `isPermanentClose(code)` – true if `code` is one of the `CLOSE_CODES` (see section 4).
    - `getLatestResume()` – returns `{ token, expSec }` if there’s a fresh token.
    - `getWs` / `setWs` – how to swap the underlying `WebSocket` instance.
    - `attachHandlers` / `detachHandlers` – how message/close handlers are attached.
    - Callbacks:
      - `onPermanentClose` – emits a synthetic `MATCH_END('connection_closed')`, clears resume tokens.
      - `onResumeAccepted` – marks the current token as consumed and clears persisted tokens.
      - `onResumeOpen` – notifies UI (`onSelfReconnected`) and restarts the ping loop.
      - `onResumeGiveUp` – clears tokens and ping loop when reconnect fails permanently.
  - The returned `onCloseAfterOpen` handler is attached as the `close` listener for **opened** sockets.

`onCloseAfterOpen` (in `createReconnector`):

- If `isPermanentClose(code)` → stop reconnecting and call `onPermanentClose`.
- If `code === 4403` (`TOKEN_REUSED` / `PLAYER_NOT_AUTHORIZED` / `SIDE_MISMATCH`) → **ignore**:
  - 4403 is used when the server intentionally closes the old socket during a successful resume.
- Otherwise, if `getLatestResume()` returns a token:
  - Begin the **resume reconnect loop**.

### 3.2 Backoff and retry strategy

`attemptReconnect(prevDelayMs)`:

- Reads `resume = getLatestResume()`.
  - If no token → `giveUp('missing-token')`.
  - If token expired (`expSec <= nowSec`) → `giveUp('expired')`.
- Calculates delay:

```ts
const delay = Math.min(Math.max(500, prevDelayMs * 2 || 500), 4000);
```

- Ensures the next attempt still falls **within the token’s remaining TTL**:
  - `remainingMs = (resume.expSec - nowSec) * 1000`.
  - If `delay > remainingMs` → `giveUp('expired')`.
- Schedules a reconnect attempt with `setTimeout`.

Within the timeout:

- Creates a new `WebSocket(resolvedUrl, ['resume', resume.token])`.
- Tracks:
  - `opened` – did the connection reach `open`?
  - `preOpenFailures` – how many resume attempts failed before open.
- On `open`:
  - `preOpenFailures = 0`.
  - `onResumeAccepted()` is called:
    - Marks the token as consumed.
    - Clears persisted tokens.
  - The new socket replaces the old one:
    - Detach handlers from old.
    - Close old with `1000, 'replaced'`.
    - `setWs(next)` and `attachHandlers(next)`.
  - `onResumeOpen(next)` is called:
    - Notifies the UI that we are back (see section 5).
    - Restarts ping loop for latency measurement.

- On `close`:
  - If we never opened (`!opened`), increment `preOpenFailures`.
  - If a **policy close** (code in `4400–4499`) or `preOpenFailures >= 3`:
    - `giveUp('rejected')`.
  - Otherwise:
    - Schedule another `attemptReconnect` with the next backoff delay.

`giveUp(reason)`:

- Marks the reconnector as `stopped`.
- Cancels any pending reconnect timer.
- Calls `onResumeGiveUp(reason)` (e.g. clear tokens + stop ping loop).

### 3.3 When reconnect attempts stop

Reconnect gives up when:

- No valid resume token exists, or token expired (`missing-token` / `expired`).
- The server closes the resume socket multiple times in a row (`preOpenFailures >= 3`).
- The server uses a **policy close code** (4400–4499) during resume.
- A **permanent close code** is received after the connection was open (see section 4).
- The client tells the reconnector to stop (e.g. on explicit `disconnect()` or on `MATCH_END` for `forfeit`).

From the user’s POV:

- If reconnect succeeds:
  - Game resumes, sometimes after a short "reconnecting" UX delay.
- If reconnect fails:
  - They eventually see a **connection error** / match end (e.g. via `MATCH_END` reason `connection_closed` or `opponent_timeout`) and fall back to the lobby.

---

## 4. Close codes: which are considered permanent?

`CLOSE_CODES` (`packages/pong/shared/src/protocol/net.ts`) define application‑level close codes:

- `ROOM_NOT_FOUND: 4404`
- `MISSING_TOKEN: 4401`
- `INVALID_TOKEN: 4401`
- `TOKEN_REUSED: 4403`
- `PLAYER_NOT_AUTHORIZED: 4403`
- `SEAT_OCCUPIED: 4402`
- `SIDE_MISMATCH: 4403`
- `JOIN_WINDOW_EXPIRED: 4408`
- `MATCH_FINISHED: 4410`
- `SERVER_ERROR: 1011`

In `connect-online.ts`, the client treats **all of these as permanent**:

- `PERMANENT_CLOSE_CODES = new Set(Object.values(CLOSE_CODES))`.
- If a close event carries one of these:
  - Any stored resume tokens for that room are cleared.
  - The WebSocket is considered permanently closed; the reconnection loop does not start.

Special case – `4403`:

- During a successful resume:
  - The game server closes the **old** socket with 4403 (`replaced-by-resume`).
  - `createReconnector.onCloseAfterOpen` explicitly ignores `code === 4403` to avoid treating it as an error.

In practice:

- Client‑visible "recoverable" disconnects are those using generic codes (e.g. network errors, 1006) where:
  - The socket closed unexpectedly.
  - The client still has a valid resume token (remember: tokens include TTL >= grace window).

---

## 5. Game‑server grace window and opponent messages

`ReconnectManager` (`apps/game-server/src/app/ReconnectManager.ts`) orchestrates what happens on the server side when a player disconnects.

### 5.1 When a player disconnects

`WSServer.handleClose` is called when a player’s socket closes:

- The player is detached from the `MatchSession`.
- A `ROOM_STATE` snapshot is broadcast (remaining players, state).
- If **both** players are now gone:
  - The last quitter is treated as the winner (to avoid tournament deadlocks).
  - The match is forfeited and cleaned up (see `GameNode.md`).
- Otherwise:
  - `ReconnectManager.onDisconnect(session, seat)` is called.

`ReconnectManager.onDisconnect`:

- Cancels any existing disconnect grace timer.
- If there is no remaining player:
  - Stops the match and marks it as stopped.
- If the match has **not started yet**:
  - Clears the start timeout and marks the model as stopped.
  - Broadcasts `ROOM_STATE` with state `'WAITING_FOR_OPPONENT'`.
- Computes `graceMs = reconnectGraceMs(isTournament, config)`:
  - Casual vs tournament grace windows (typically: tournaments get a longer window).
- If the match **had started**:
  - Pauses the match loop: `runner.stop(session, { pauseOnly: true })`.
  - Sends `OPPONENT_DISCONNECTED` to the remaining player via `Broadcaster.notifyOpponentDisconnected(session, seat, graceMs)`.
- Schedules a timeout for `graceMs`:
  - If the player reconnects before the timeout:
    - `ReconnectManager.onReconnect` cancels the grace timer and resumes (see 5.2).
  - If the timeout fires and the player is still missing:
    - The remaining player is declared the winner:
      - `winnerSide = seatToSide(session.model.state.playerAtEnd, remainingSeat)`.
    - `ResultReporter.report` builds the match summary with reason `'timeout'`.
    - `Broadcaster.notifyMatchEnd(session, 'opponent_timeout', winnerSide, summary)`:
      - Sends `MATCH_END` to any remaining client(s).
    - All sockets are closed with `1000, 'match-ended'` to stop further resume rotation.
    - The match is cleared from the registry.

### 5.2 When a player reconnects

On resume:

- The gateway validates the resume token and proxies to the game node.
- `WSServer.handleResumeConnection`:
  - Consumes the token via `ResumeTokenService.consume`.
  - Validates room, session, and expected player.
  - Re‑attaches the player socket and (re)binds resume rotation.
  - Calls `ReconnectManager.onReconnect(session, seat)`.
  - Broadcasts a fresh `ROOM_STATE`.

`ReconnectManager.onReconnect`:

- Cancels any pending disconnect grace.
- If both players are present and the match **never started**:
  - Logs and calls `runner.scheduleStart(session)` again.
- Otherwise:
  - Sends `OPPONENT_RECONNECTED` to both players.
  - If the match was previously started:
    - Resumes the tick loop: `runner.resume(session)`.

From the remaining player’s POV:

- They see:
  - `OPPONENT_DISCONNECTED` with `gracePeriodMs`.
  - Later either:
    - `OPPONENT_RECONNECTED` and gameplay resumes, or
    - `MATCH_END` with reason `'opponent_timeout'` and a summary.

---

## 6. Frontend UI and state transitions

The reconnect behavior on the UI side is split between:

- The **Pong host** and reconnect logic (`connect-online.ts`, `reconnect.ts`).
- The **online matchmaking page** (`OnlineGame.tsx` + `state/machine.ts`).
- Shared hooks (`useGameBootstrap`, `useOnlineMatchEnd`, `useMatchOverEvent`).

### 6.1 OnlineGame state machine vs in‑match state

`OnlineGame` state machine (`apps/frontend/src/pages/pong/online/state/machine.ts`) tracks:

- `status` ∈ `{ 'connecting', 'idle', 'in_queue', 'match_found', 'match_accepted', 'starting', 'playing', 'postmatch' }`.

Roughly:

- `connecting` – matchmaking WebSocket establishing.
- `idle` / `in_queue` / `match_found` / `match_accepted` – lobby and queue states.
- `starting` – handoff received, bootstrapping the in‑match host (`useGameBootstrap` + `connectOnline`).
- `playing` – active match (canvas & controls visible via `PlayingView`).
- `postmatch` – result screen (`PostMatchOnlineView`).

Reconnect/resume mainly affects the **playing** and **starting** phases:

- While `status === 'starting'` or `'playing'`:
  - `useGameBootstrap` has instantiated the online host using `connectOnline`.
  - The reconnector is active on the game WS.
- If the user navigates away or clicks "Quit":
  - `handleQuit` in `OnlineGame` calls `giveUp()`:
    - Sends `{ type: 'forfeit' }` to server.
    - Sets a flag `skipAutoResumeRef.current = true` to avoid auto‑resuming.
    - Keeps match active until `MATCH_END` arrives so the post‑match screen can display.

### 6.2 Auto‑resume after refresh or navigation

`OnlineGame` also supports auto‑resume when the user returns to `/pong/online`:

- On mount (when user is logged in and `status === 'idle'`):
  - Calls `findAnyStoredResumeCandidate()` (from `resume.ts`).
  - If a candidate exists (valid room + token with future `exp`):
    - Dispatches a synthetic `handoff` action:
      - `serverUrl: /g/<roomIdentifier>`
      - `matchId: 'resume'`
      - `roomIdentifier`, `joinToken: ''` (join not used)
      - `side: 'east'` (placeholder; actual seat comes from `ROOM_STATE` / `START`)
    - This moves `status` to `'starting'` and triggers `useGameBootstrap` which calls `connectOnline` in **resume‑first mode**.

If resume fails (e.g., token expired or rejected):

- `useOnlineMatchEnd` and `onBootstrapFailed` in `OnlineGame` ensure:
  - User is navigated back to `/pong/online`.
  - State resets to a clean lobby (no stuck "starting" state).

### 6.3 Opponent disconnect/reconnect and self reconnect UX

`OnlineClient` (from `connectOnline`) exposes:

- `onOpponentDisconnected(cb)` and `onOpponentReconnected(cb)`:
  - Wired by `useGameBootstrap` / Pong UI to:
    - Show an "Opponent disconnected, waiting X seconds" overlay using `gracePeriodMs`.
    - Hide it when `OPPONENT_RECONNECTED` arrives.
  - If `MATCH_END` with reason `'opponent_timeout'` arrives instead:
    - `useOnlineMatchEnd` triggers the post‑match flow with a message like "Opponent disconnected".

- `onSelfReconnected(cb)`:
  - Called via `notifySelfReconnected` when `onResumeOpen` fires:
    - Used by the UI to display a brief "Reconnected – synchronizing" overlay for the local player.

- `onMatchEnd(cb)`:
  - Handles reasons:
    - `'completed'` – natural end of match.
    - `'forfeit'` – you or opponent forfeited.
    - `'opponent_timeout'` – peer failed to reconnect within grace.
    - `'error'` – server‑side error.
    - `'connection_closed'` – synthetic reason when a permanent close code is treated as unrecoverable.
  - Feeds `useOnlineMatchEnd` which:
    - Shows snackbars.
    - Updates `OnlineGame` state to `'postmatch'`.
    - Navigates back when appropriate.

---

## 7. Putting it together – timeline examples

### 7.1 Temporary network blip (successful resume)

1. Match is running (`status: 'playing'`), periodic `RESUME_TOKEN` messages are being stored.
2. User’s network drops; game WS closes with a generic close code (not permanent).
3. Client reconnector:
   - Sees a non‑permanent close with a valid, non‑expired resume token.
   - Schedules an immediate resume attempt (500 ms) with exponential backoff up to 4 seconds.
4. Gateway validates resume, proxies to game node.
5. Game server:
   - Consumes the resume token, binds new socket to existing seat.
   - Cancels disconnect grace and resumes tick loop.
   - Sends `OPPONENT_RECONNECTED` to both players.
6. Client:
   - Swaps sockets, restarts ping loop.
   - `onSelfReconnected` displays a brief "Reconnected" message.

Result: match continues after a short pause; from the UX perspective, the game freezes or shows a reconnect overlay, then resumes.

### 7.2 Opponent disconnects and never comes back

1. Both players are playing; opponent’s connection drops.
2. Game server:
   - Detaches opponent, broadcasts `ROOM_STATE`.
   - Starts a grace timer via `ReconnectManager.onDisconnect`.
   - Sends `OPPONENT_DISCONNECTED` with `gracePeriodMs` to the local player.
3. Local client:
   - Shows "Opponent disconnected; waiting X seconds" overlay.
4. Opponent fails to reconnect before grace expires:
   - `ReconnectManager` reports result with reason `'timeout'`.
   - `Broadcaster.notifyMatchEnd` sends `MATCH_END` with reason `'opponent_timeout'`.
   - Remaining sockets are closed with `1000, 'match-ended'`.
5. Local client:
   - `onMatchEnd` triggers post‑match flow.
   - User sees "Opponent disconnected" result summary and eventually returns to `/pong`.

### 7.3 You click “Quit” (forfeit)

1. While playing, local user clicks "Quit" button.
2. `OnlineGame.handleQuit` calls `giveUp()` from `useGameBootstrap`:
   - `connectOnline.forfeit()` sends `{ type: 'forfeit' }`.
   - Clears resume tokens and sets `skipAutoResumeRef` to avoid auto‑resume.
3. Game server:
   - Treats the forfeit as an immediate match end.
   - Calls `ResultReporter.report` with reason `'forfeit'`.
   - Sends `MATCH_END` with reason `'forfeit'`.
   - Closes sockets and clears session.
4. Client:
   - `onMatchEnd('forfeit')` triggers same post‑match flow with a different message ("You forfeited" / "Opponent forfeited").
   - Reconnection attempts are explicitly stopped.

---

## 8. Where to go next

- For a **wire‑level catalogue** of messages and close codes, see `ProtocolReference.md`.
- For **data‑plane timing** (ticks, FRAME cadence, lag compensation, latency smoothing), see `OnlinePongDataPlane.md`.
- For the **high‑level online journey**, see `OnlinePongNetwork.md`.
- For token structure and secrets, see `SecurityAndTokens.md`.
- For game‑server internals and result reporting, see `GameNode.md` and `ResultsAndRanking.md`.
