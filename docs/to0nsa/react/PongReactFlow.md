# Pong React Flow – Local, Online, and Tournaments

This document focuses on the **React side** of Pong:

- How the different Pong modes are wired into React routing and layout.
- How local (offline) matches are orchestrated.
- How online matches use hooks and state machines on top of the network stack.
- How tournament pages compose hooks and shared components.

For the network/control‑plane view, read this together with:

- `docs/to0nsa/workflow/OnlinePongNetwork.md` – end‑to‑end online network flow.
- `docs/to0nsa/workflow/MatchmakingService.md`, `GameNode.md`, `GatewayAndWebSockets.md`.

---

## 1. Entry point to Pong: `ModePicker`

**File:** `apps/frontend/src/pages/pong/ModePicker.tsx`

This is the “home page” for Pong under `/pong`.

React responsibilities:

- Renders a simple selector between:
  - Local mode – `/pong/local`
  - Online mode – `/pong/online`
  - Tournament mode – `/pong/tournaments`
- Uses `PageContainer` + `PageSection` + `PageHeader` + `Card` to fit inside `PongLayout`.
- Preloads game bundles:

  ```tsx
  useEffect(() => {
    const run = () => {
      preloadLocalPong();
      preloadOnlinePong();
    };
    // requestIdleCallback or fallback setTimeout
  }, []);
  ```

That means when the user chooses a mode, the heavy game code is likely already in cache, reducing perceived latency.

---

## 2. Local Pong (offline) – `LocalGame`

**File:** `apps/frontend/src/pages/pong/local/LocalGame.tsx`

High‑level React flow:

1. **State and refs:**
   - `canvasRef` – ref to the `<canvas>` where Pong is rendered.
   - Local state:
     - `isPlaying` – whether a match is running.
     - `aiEnabled`, `botDifficulty` – AI settings.
     - `postMatch` – last match summary (or `null`).

2. **Settings management:**
   - `useLocalSettings()`:
     - Holds tunable settings (controllers, number of games, rules).
     - Persists them in `localStorage`.
     - Exposes `settings`, `update`, `save`, `reset`, `resetRules`, `restore`.

3. **Bootstrapping the local Pong runtime:**
   - `usePongRuntime({ playing: isPlaying, canvasRef, settings, onBootstrapFailed })`:
     - When `isPlaying` is true and `canvasRef` is ready, loads the local Pong host and starts the simulation.
     - Exposes `runtimeRef` and `ready` for other hooks (e.g. AI).
   - On bootstrap failure, uses `useSnackbar` to show an error and resets `isPlaying`.

4. **AI and match lifecycle:**
   - `useAIBot({ enabled, playing, difficulty, canvasRef, runtimeRef, runtimeReady, botSeat })`:
     - Drives AI paddle input based on game state.
   - `useLocalMatchEnd({ canvasRef, playing, onSummary, onAutoExit })`:
     - Listens for `'pong:matchOver'` events and:
       - Fills `postMatch` with a summary.
       - Sets `isPlaying` false after an optional auto‑exit.

5. **Input and body state:**
   - `useKeyboardQuit(isPlaying, handleQuit)`:
     - Lets the user quit with a key (e.g. Escape) when a match is active.
   - `useBodyClass('pong-playing', isPlaying)`:
     - Adds a body class while a local match is in progress.
   - `useSetMatchActivity()`:
     - Marks match activity in `MatchActivityContext` so global UI (chat) can react.

6. **Rendering:**

   ```tsx
   if (postMatch) {
     return (
       <PageContainer>
         <PageSection>
           <PostMatchView ... />
         </PageSection>
       </PageContainer>
     );
   }

   if (isPlaying) {
     return <PlayingView canvasRef={canvasRef} onQuit={handleQuit} />;
   }

   return (
     <PageContainer>
       <PageSection>
         <SettingsView ... /> {/* Local settings + play button */}
       </PageSection>
     </PageContainer>
   );
   ```

The component is essentially a **three‑state UI**:

- Settings → `PLAY` → PlayingView → `'pong:matchOver'` → PostMatchView.

---

## 3. Online Pong – `OnlineGame`

**File:** `apps/frontend/src/pages/pong/online/OnlineGame.tsx`

This is the React “orchestra” for online matches; it wires together:

- Matchmaking WebSocket (`useMatchmakingClient`).
- Online state machine (`useReducer`).
- Game bootstrap (`useGameBootstrap` + canvas).
- Match end and post‑match UI.
- Match activity and auto‑resume.

### 3.1 Core state and context

- `const canvasRef = useRef<HTMLCanvasElement | null>(null);`
- `[state, dispatch] = useReducer(reducer, initialState);` → online state machine.
- From `AppContext`:
  - `{ axios, navigate, user, setUser, userReady }`.
- From `SnackbarContext`:
  - `enqueueSnackbar`.
- From `MatchActivityContext`:
  - `useSetMatchActivity()` – mark match activity globally.

`state` tracks:

- Status: `'idle' | 'connecting' | 'in_queue' | 'match_found' | 'match_accepted' | 'starting' | 'playing' | 'postmatch' | ...`
- Matchmaking info: `clientId`, `matchId`, `opponent`.
- Handoff info: `serverUrl`, `roomIdentifier`, `joinToken`, `randomSeed`, `seat`.
- Post‑match summary.

### 3.2 Matchmaking WebSocket

- `useMatchmakingClient({ dispatch, connectKey, enabled, onAuthError, ... })`:
  - Opens a WebSocket to `/matchmaking`.
  - On messages:
    - `CONNECTED` → `dispatch({ type: 'connected', clientId })`.
    - `QUEUE_JOINED`/`QUEUE_LEFT` → update status.
    - `MATCH_FOUND` → store `matchId` + opponent details.
    - `HANDOFF` → store game server URL, room ID, join token, random seed, and side.
    - Tournament messages → drive tournament views (outside this component).
  - Exposes functions:
    - `joinQueue`, `leaveQueue`, `acceptMatch`, `declineMatch`, `confirmJoin`.

OnlineGame wires those handlers to UI controls (`QueueControls`, `MatchFoundPanel`).

### 3.3 Game bootstrap

- `const bootstrapConfig = useBootstrapConfig(state);`
  - Returns `null` until handoff data is complete.
  - When ready, returns `{ serverUrl, matchId, roomIdentifier, joinToken, randomSeed, seat }`.

- `useGameBootstrap({ canvasRef, active: matchActive, config: bootstrapConfig, onStarted, onEnded })`:
  - `matchActive` is true when status is `'starting' | 'playing' | 'postmatch'`.
  - When `active` and `config` are valid:
    - Dynamically imports the online host bundle (`bootstrapOnlinePong`).
    - Connects to the game server via `/g/:roomId` with join/resume tokens (see `OnlinePongNetwork.md`).
    - Calls `onStarted()` when the match officially starts.
    - Calls `onEnded(payload)` with `MatchEndPayload` when the match ends.
  - Exposes `giveUp()`, which sends a forfeit message to the server.

### 3.4 Match end and post‑match

- `useOnlineMatchEnd(...)`:
  - Receives `MatchEndPayload` from the game host via `onEnded`.
  - Shows snackbars depending on `payload.reason` (completed, opponent timeout, forfeit, errors).
  - Sets post‑match state (`state.postMatchSummary`) after a delay.

Rendering:

- While playing:

  ```tsx
  if (state.status === 'starting' || state.status === 'playing') {
    return <PlayingView canvasRef={canvasRef} onQuit={handleQuit} />;
  }
  ```

- After match:

  ```tsx
  if (state.status === 'postmatch' && state.postMatchSummary) {
    return (
      <PageContainer>
        <PageSection className="flex min-h-[60vh] items-center justify-center">
          <PostMatchOnlineView
            summary={state.postMatchSummary}
            onBackToMenu={() => navigate('/pong')}
          />
        </PageSection>
      </PageContainer>
    );
  }
  ```

- In lobby (idle/in queue/match found):
  - Uses `SurfaceCard`, `StatusBadge`, `QueueControls`, `MatchFoundPanel`, and `ConfirmDialog`.

### 3.5 Match activity and auto‑resume

- Match activity:

  ```tsx
  const matchActive =
    state.status === 'starting' || state.status === 'playing' || state.status === 'postmatch';
  const setMatchActive = useSetMatchActivity();

  useEffect(() => {
    setMatchActive(matchActive);
    return () => setMatchActive(false);
  }, [matchActive, setMatchActive]);
  ```

  This keeps the global “match active” flag in sync, disabling chat UI during matches.

- Auto‑resume:
  - On mount, if `userReady && user && state.status === 'idle'`, it calls `findAnyStoredResumeCandidate()` and, if present, dispatches a synthetic `handoff` so the game can reconnect to an existing room using a resume token.
  - `skipAutoResumeRef` prevents auto‑resume after an intentional quit.

---

## 4. Tournaments – `TournamentPage`

**File:** `apps/frontend/src/pages/pong/tournament/TournamentPage.tsx`

This page is a more complex React orchestrator for **tournament mode**.

High‑level responsibilities:

- Show a list of available tournaments (lobby).
- Show a detailed view for a specific tournament (participants, bracket).
- React to tournament events (matches scheduled, countdowns).
- Host actual tournament matches using the same `PlayingView` and online host stack.

It delegates most of the heavy lifting to `useTournamentPageController`.

### 4.1 `useTournamentPageController` (conceptual)

**File:** `apps/frontend/src/pages/pong/tournament/hooks/useTournamentPageController.ts`

Combines:

- User/auth context (`useAppContext`).
- Tournament network hooks:
  - `useTournamentConnection` – subscribe to tournament updates via the matchmaking WebSocket.
  - `useMatchCountdown` – track countdowns.
  - `useMatchLifecycle` – bootstrap and manage the match canvas when a scheduled match is ready.
- Local UI state:
  - Which tournament is active.
  - Whether we’re in detail view or overview.
  - Loading/error state for headers and lists.

It returns:

- User info and ready flag.
- Tournament lists and active tournament metadata.
- Match info (`pendingMatch`, `matchPhase`, `canvasRef`, `handleQuitMatch`).
- Handlers for creating/joining/leaving tournaments and refreshing data.

### 4.2 Rendering phases

`TournamentPage` uses this controller and follows a similar pattern to `OnlineGame`:

- If user is unauthenticated:
  - Show a `SurfaceCard` explaining that you need to log in, plus a button to navigate to `/login`.

- If a match is starting/playing:
  - Use `PlayingView canvasRef={canvasRef} onQuit={handleQuitMatch}` to show full‑screen tournament matches.

- If the tournament name is loading:
  - Show a centered `Spinner` in a `PageContainer`/`PageSection`.

- Otherwise:
  - Render a header in a `SurfaceCard`.
  - In overview mode: show `TournamentLobbyPanel` to list/join/create tournaments.
  - In detail mode: render participants, bracket, directed matches, and countdowns using several panels, plus `TournamentChatAnnouncer` to bridge tournament events into chat.

Tournaments therefore reuse the **same visual language and game bootstrapping** as online matches, but the control logic comes from tournament‑specific hooks.

---

## 5. How everything fits together

From the React perspective:

- `/pong` (`ModePicker`) is just a **router + preloader** that chooses which mode to enter and warms up bundles.
- Local and online play are **small, well‑structured state machines** that:
  - Use shared layout components (`PongLayout`, `PageContainer`, `PageSection`, `SurfaceCard`, `PlayingView`).
  - Use hooks to isolate concerns (matchmaking, runtime bootstrap, AI, match end, keyboard handling, body classes, match activity context).
- Tournaments layer additional state machines on top of the same primitives.

When working on Pong features:

- For **UI/layout** changes, start from `UIComponentsAndLayout.md` and the corresponding page component (`LocalGame`, `OnlineGame`, `TournamentPage`).
- For **network/flow** changes, cross‑reference `OnlinePongNetwork.md` and the hooks in `hooks-index.md`.
- For **React behavior** changes (effects, state machines, contexts), this doc plus `React.md`/`NativeHooks.md` should give you the mental model for how the pieces currently fit together.
