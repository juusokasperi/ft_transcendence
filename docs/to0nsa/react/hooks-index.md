# Custom React Hooks in ft_transcendence – Overview

This document is an index of the **project‑specific `useX` hooks** used in the frontend, with short descriptions and pointers to where they are implemented.

It’s meant as a quick “what does this hook do again?” reference while you’re reading or modifying code.

For each hook below, you can open its source file for full details.

---

## 1. Global app & routing hooks

- `useRequireAuth()`  
  **File:** `apps/frontend/src/hooks/useRequireAuth.tsx`  
  **What it does:** Guard for protected routes. Checks if the user is logged in from `AppContext`; if not, it redirects to the login page (optionally preserving the intended destination), and returns loading/ready flags so components can avoid rendering sensitive content before auth status is known.

---

## 2. Context hooks (global state)

These hooks are the “official” way to access React context providers set up in `App.tsx` and nearby files.

- `usePresence()`  
  **File:** `apps/frontend/src/context/PresenceContext.tsx`  
  **What it does:** Returns presence data for users (online/offline, last seen). Used by the chat UI and user lists to show who is online. Internally subscribes to presence updates from the realtime socket.

- `useChatContext()`  
  **File:** `apps/frontend/src/context/ChatContext.tsx`  
  **What it does:** Provides chat‑related state and actions: current channel, message list, send functions (`sendMessage`, `sendPrivateMessage`), invite helpers, loading/error flags, etc. Drives the main `Chat` component.

- `useMatchActivity()` / `useSetMatchActivity()`  
  **File:** `apps/frontend/src/context/MatchActivityContext.tsx`  
  **What they do:**  
  - `useMatchActivity()` – read‑only flag indicating whether a Pong match is currently active. Used by `App.tsx` to hide chat during a match.  
  - `useSetMatchActivity()` – setter function used by Pong pages (`OnlineGame`, local modes) to mark when a match starts or ends.

- `useRealtimeSocket()`  
  **File:** `apps/frontend/src/context/RealtimeSocketContext.tsx`  
  **What it does:** Gives components access to the shared `/chat` WebSocket connection: `send`, `subscribe`, connection state, and user identity info used for realtime features (chat and presence). Wraps low‑level `WebSocket` and exposes a higher‑level API.

> Note: other context hooks like `useAppContext()` and `useSnackbar()` are described in `React.md` and context‑specific docs; they follow the same pattern.

---

## 3. Local Pong (offline) hooks

These hooks are used under `apps/frontend/src/pages/pong/local/` when playing local (offline) Pong.

- `useAIBot(options)`  
  **File:** `apps/frontend/src/pages/pong/local/hooks/useAIBot.ts`  
  **What it does:** Implements a simple AI opponent for local matches. Listens to game state (ball position, difficulty settings) and produces axis input for the AI paddle, which is fed into the Pong runtime.

- `useLocalMatchEnd({ canvasRef, playing, onSummary, onAutoExit })`  
  **File:** `apps/frontend/src/pages/pong/local/hooks/useLocalMatchEnd.ts`  
  **What it does:** Watches for the custom `'pong:matchOver'` event fired by the local game on the canvas element. When a match ends, extracts summary data, calls `onSummary`, and optionally triggers `onAutoExit` after a delay to return to the menu.

- `useLocalSettings(options?)`  
  **File:** `apps/frontend/src/pages/pong/local/hooks/useLocalSettings.ts`  
  **What it does:** Manages user‑tunable local game settings (difficulty, number of games, etc.), persisting them in `localStorage` so they survive page reloads. Provides current settings and setters to the UI.

- `useKeyboardQuit(active, onQuit)`  
  **File:** `apps/frontend/src/pages/pong/local/hooks/useKeyboardQuit.ts`  
  **What it does:** Installs a key handler (e.g. `Escape`) when `active` is true so the player can quit a match with the keyboard. Calls `onQuit()` when the key combo is pressed.

- `usePongRuntime({ canvasRef, settings, onMatchOver })`  
  **File:** `apps/frontend/src/pages/pong/local/hooks/usePongRuntime.ts`  
  **What it does:** Bootstraps and manages the **local** Pong runtime: creates the Babylon scene, starts the local game loop, wires in input handlers, and listens for match‑over events. Returns control functions such as `start`, `pause`, or destruction of the runtime when the component unmounts.

---

## 4. Online Pong hooks

These hooks live in `apps/frontend/src/pages/pong/online/` and are used by the online Pong page (`OnlineGame.tsx`).

- `useMatchmakingClient(args)`  
  **File:** `apps/frontend/src/pages/pong/online/hooks/useMatchmakingClient.ts`  
  **What it does:** Manages the WebSocket connection to the matchmaking service (`/matchmaking`):
  - Creates the client via `createMatchmakingClient`.
  - Listens for `MatchmakingMessage` events (`CONNECTED`, `QUEUE_JOINED`, `MATCH_FOUND`, `HANDOFF`, errors, tournament updates).
  - Dispatches actions into the online state machine.
  - Exposes methods (`joinQueue`, `leaveQueue`, `acceptMatch`, `declineMatch`, `confirmJoin`, etc.) that the UI calls.
  - Handles reconnects and rate‑limit/auth/allocator errors via callbacks.

- `useOnlineMatchEnd(config, onBootstrapFailed)`  
  **File:** `apps/frontend/src/pages/pong/online/hooks/useOnlineMatchEnd.ts`  
  **What it does:** Centralizes what happens when an **online** match ends:
  - Interprets `MatchEndPayload` (reason, winner, summary).
  - Shows appropriate snackbars (win/lose, timeout, forfeit).
  - Decides when to transition the online state machine to the post‑match view.
  - Handles special cases like bootstrap failure or opponent disconnect.

- `useBootstrapConfig(state)`  
  **File:** `apps/frontend/src/pages/pong/online/hooks/useBootstrapConfig.ts`  
  **What it does:** Derives a “ready to connect” config from the online state machine:
  - Returns `null` until `serverUrl`, `matchId`, `roomIdentifier`, `joinToken`, and `randomSeed` are all present.
  - When ready, returns the config object used by `useGameBootstrap` to start the online host.

- `useGameBootstrap({ canvasRef, active, config, onStarted, onEnded })`  
  **File:** `apps/frontend/src/pages/pong/online/hooks/useGameBootstrap.ts`  
  **What it does:** Responsible for bootstrapping and tearing down the **online** Pong client:
  - When `active` and `config` are valid, dynamically imports the online Pong host bundle.
  - Calls `bootstrapOnlinePong` with the canvas and network config to connect to the game server via the gateway.
  - Calls `onStarted()` when the match officially starts and `onEnded(payload)` when the match ends.
  - Cleans up the game instance when `active` becomes false or the component unmounts, and exposes a `giveUp()` helper to send a forfeit.

- `useQueueTimer(status)`  
  **File:** `apps/frontend/src/pages/pong/online/hooks/useQueueTimer.ts`  
  **What it does:** Simple timer hook that tracks how long the player has been in the matchmaking queue. It starts counting when status is `'in_queue'`, stops/reset otherwise, and returns the elapsed seconds for display in the UI.

---

## 5. Shared Pong hooks

These hooks are shared across local and online Pong pages.

- `useMatchOverEvent({ canvasRef, active, onMatchOver, onAutoExit, autoExitDelayMs })`  
  **File:** `apps/frontend/src/pages/pong/shared/hooks/useMatchOverEvent.ts`  
  **What it does:** Listens for the custom `'pong:matchOver'` DOM event on the given canvas when `active` is true:
  - When fired, optionally extracts details from the event.
  - Calls `onMatchOver(detail)` for the caller.
  - If `onAutoExit` is provided, triggers it after `autoExitDelayMs` milliseconds.
  Used by local modes; online mode relies primarily on server‑sent `MATCH_END`.

- `useBodyClass(className, active)`  
  **File:** `apps/frontend/src/pages/pong/shared/hooks/useBodyClass.ts`  
  **What it does:** Toggles a CSS class on `document.body` while a condition is active. For example, `OnlineGame` uses it to add a “pong‑playing” class during matches so global styling can respond (e.g. hide scrollbars or adjust background).

---

## 6. Tournament hooks

These hooks support the tournament views and flows under `apps/frontend/src/pages/pong/tournament/`.

- `useMatchCountdown({ pendingMatch, matchCountdowns })`  
  **File:** `apps/frontend/src/pages/pong/tournament/hooks/useMatchCountdown.ts`  
  **What it does:** Tracks countdown timers for scheduled tournament matches. Subscribes to countdown updates (from matchmaking) and exposes the remaining time and status so the UI can show “Match starting in X seconds” banners.

- `useTournamentList({ pageSize, filters, autoRefresh })`  
  **File:** `apps/frontend/src/pages/pong/tournament/hooks/useTournamentList.ts`  
  **What it does:** Fetches and manages a list of tournaments from the backend:
  - Handles loading/error states and pagination.
  - Optionally auto‑refreshes the list at an interval.
  Used by tournament index pages.

- `useMatchLifecycle({ canvasRef, active, onEnd, tournamentContext })`  
  **File:** `apps/frontend/src/pages/pong/tournament/hooks/useMatchLifecycle.ts`  
  **What it does:** Orchestrates a single tournament match lifecycle:
  - Bootstraps the online host similarly to `useGameBootstrap`, but with tournament context.
  - Wires up match end handling specific to tournaments (bracket progression, etc.).

- `useTournamentConnection({ tournamentId })`  
  **File:** `apps/frontend/src/pages/pong/tournament/hooks/useTournamentConnection.ts`  
  **What it does:** Manages tournament‑specific communication over the matchmaking WebSocket:
  - Joins a tournament, listens for lobby/bracket updates, countdowns, and scheduled matches.
  - Exposes current tournament state and helper actions (ready up, forfeit, leave).

- `useActiveTournament({ tournamentId })`  
  **File:** `apps/frontend/src/pages/pong/tournament/hooks/useActiveTournament.ts`  
  **What it does:** High‑level hook that combines `useTournamentConnection` and local state to represent “the active tournament” on a page: participants, matches, current user’s status, etc.

- `useTournamentPageController(...)`  
  **File:** `apps/frontend/src/pages/pong/tournament/hooks/useTournamentPageController.ts`  
  **What it does:** Page‑level controller hook that wires together tournament list, active tournament, routing, and UI state for the main tournament screen. Centralizes the state machine for the tournament UI.

---

## 7. How to use this index

When you see a custom hook in a component (e.g. `useGameBootstrap`, `useMatchmakingClient`, `useRealtimeSocket`, `useLocalSettings`):

1. Check this file to remind yourself what it does in plain language.
2. Jump to the listed source file if you need implementation details.
3. Cross‑reference with:
   - `docs/to0nsa/react/React.md` for overall React structure, and
   - `docs/to0nsa/workflow/*.md` for how the hook participates in the wider online Pong workflow.

