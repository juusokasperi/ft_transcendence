# React in ft_transcendence (frontend + Pong)

This document is a **mini‑course on how React is used in this app**, with a focus on:

- The main React entry (`apps/frontend/src/main.tsx`)
- The top‑level app component and routing (`apps/frontend/src/App.tsx`)
- The Pong pages under `apps/frontend/src/pages/pong/`

It explains the main patterns you see:

1. How the React app is bootstrapped
2. Routing and page layout
3. Context providers (global state, sockets, presence, snackbars)
4. Local state and hooks (including custom hooks)
5. Pong layout and shared UI components
6. Local Pong game flow
7. Online Pong game flow (high level)

For quick reference on hooks, global state, layout, data fetching, and Pong flows, you can also read:

- `Context.md` – what each React context (App, Snackbar, RealtimeSocket, Presence, Chat, MatchActivity, Sidebar) provides and when to use it.
- `NativeHooks.md` – how built‑in React hooks (`useState`, `useEffect`, `useReducer`, etc.) are used in this app.
- `hooks-index.md` – what each project‑specific `useX` hook does and where it lives.
- `UIComponentsAndLayout.md` – how Pong layout, shared page components, and the navbar/canvas view are structured.
- `PongReactFlow.md` – how React pieces for local, online, and tournament modes are wired together on top of the networking stack.
- `DataFetchingAndErrors.md` – how components call backend APIs and handle loading/error states.

You don’t need to know every React feature to follow the code — this doc focuses on **the patterns actually used in this project**.

---

## 1. Bootstrapping the React app (`main.tsx`)

Entry file: `apps/frontend/src/main.tsx`.

Key ideas:

- React builds a UI tree and attaches it to an existing DOM element (`<div id="root">`).
- Providers at the top (Router, AppProvider, MatchActivityProvider) make data and behavior available to the whole app.

Stripped‑down structure:

```tsx
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { BrowserRouter as Browser } from 'react-router-dom';
import { AppProvider } from './context/AppContext.tsx';
import { MatchActivityProvider } from './context/MatchActivityContext';

createRoot(document.getElementById('root')!).render(
  <Browser>
    <AppProvider>
      <MatchActivityProvider>
        <App />
      </MatchActivityProvider>
    </AppProvider>
  </Browser>,
);
```

Important pieces:

- `createRoot(...).render(<App />)` boots the React app into the `root` DOM node.
- `<Browser>` from `react-router-dom` enables client‑side routing (URL → component).
- `<AppProvider>` gives app‑level state (user, navigation helpers, etc.).
- `<MatchActivityProvider>` tracks whether a Pong match is currently active.

Takeaway: **all routes and components further down the tree can access these contexts** using hooks like `useAppContext()` and `useMatchActivity()`.

---

## 2. App component and routing (`App.tsx`)

File: `apps/frontend/src/App.tsx`.

This is the “router shell” that decides **what page to show** based on the URL, and also where the global chat UI lives.

### 2.1 Imports and setup

Top of the file:

- React hooks: `useEffect`, `useState`, `lazy`.
- React Router: `Routes`, `Route`.
- Page components: `Home`, `Login`, `Profile`, `PongLayout`, etc.
- UI and context: `Chat`, `ChatToggleButton`, `SidebarProvider`, `SnackbarProvider`, `ChatProvider`, `RealtimeSocketProvider`, `PresenceProvider`, `useAppContext`, `useMatchActivity`.
- `lazy`‑loaded Pong screens: `ModePicker`, `LocalGame`, `OnlineGame`, `Tournament`, `TournamentDetail`.

### 2.2 Local state and effects

Inside `App`:

- `const { user } = useAppContext();` – read current user from context.
- `const [chatOpen, setChatOpen] = useState(false);` – UI state for chat visibility.
- `const matchActive = useMatchActivity();` – track whether a Pong match is active.
- `const chatUiEnabled = Boolean(user && !matchActive);` – disable chat during active matches.

Effect:

```tsx
useEffect(() => {
  if (!chatUiEnabled && chatOpen) {
    setChatOpen(false);
  }
}, [chatOpen, chatUiEnabled]);
```

If a match starts or the user logs out:

- `chatUiEnabled` becomes false, and
- any open chat is automatically closed.

### 2.3 Global providers and chat UI

JSX structure (simplified):

```tsx
return (
  <SidebarProvider>
    <SnackbarProvider>
      <RealtimeSocketProvider>
        <PresenceProvider>
          <ChatProvider channel={channel}>
            <div>
              {chatUiEnabled && (
                <>
                  {!chatOpen && <ChatToggleButton open={chatOpen} setOpen={setChatOpen} />}
                  <Chat onClose={() => setChatOpen(false)} channel={channel} isOpen={chatOpen} />
                </>
              )}
              <Routes>{/* all routes here */}</Routes>
            </div>
          </ChatProvider>
        </PresenceProvider>
      </RealtimeSocketProvider>
    </SnackbarProvider>
  </SidebarProvider>
);
```

Providers:

- `SidebarProvider` – state for sidebar UI.
- `SnackbarProvider` – transient toast notifications (`useSnackbar()` hook).
- `RealtimeSocketProvider` / `PresenceProvider` – manage real‑time WebSocket connection and online presence.
- `ChatProvider` – chat channel and messages.

The order matters: **children can only use a context if they are inside the corresponding Provider**.

Chat UI:

- `ChatToggleButton` and `Chat` are conditionally rendered only if `chatUiEnabled` is true.
- `Chat` receives props (`onClose`, `channel`, `isOpen`) and uses its own internal UI + context.

### 2.4 Routes and nested routing for Pong

Inside `<Routes>` you see:

- Standard pages: `/`, `/signup`, `/login`, etc.
- A nested route for Pong:

```tsx
<Route path="/pong" element={<PongLayout />}>
  <Route index element={<ModePicker />} />
  <Route path="local" element={<LocalGame />} />
  <Route path="online" element={<OnlineGame />} />
  <Route path="tournaments" element={<Tournament />} />
  <Route path="tournaments/:tournamentId" element={<TournamentDetail />} />
</Route>
```

Key ideas:

- `PongLayout` is the **layout shell** for all Pong screens (navbar, background video, etc.).
- `index` route is the default child at `/pong` (the mode picker).
- Nested routes share `PongLayout` but render different content via `<Outlet />` inside that layout.

---

## 3. Pong layout and shared components

### 3.1 `PongLayout` (layout shell)

File: `apps/frontend/src/pages/pong/PongLayout.tsx`.

Key features:

- Uses `<Navbar />` as a header.
- Uses `<BackgroundVideo />` for a looping video background.
- Wraps nested `Pong` routes in a `<Suspense>` with a spinner fallback.

Structure:

```tsx
export default function PongLayout() {
  return (
    <div id="pong-shell" className="fixed inset-0 text-white">
      <header>
        <Navbar />
      </header>

      <main className="absolute inset-x-0 bottom-0 top-[var(--navbar-h,80px)] overflow-y-auto">
        <BackgroundVideo src={gifImg} fit="contain" position="center" />
        <section className="relative z-10 min-h-full pb-[env(safe-area-inset-bottom)]">
          <Suspense fallback={/* PageContainer + Spinner */}>
            <Outlet />
          </Suspense>
        </section>
      </main>
    </div>
  );
}
```

React concepts:

- `<Suspense>` works with `React.lazy` to show a fallback (spinner) while child components are being loaded.
- `<Outlet />` renders the matched child route (`ModePicker`, `LocalGame`, `OnlineGame`, etc.).

### 3.2 Shared layout components

Under `apps/frontend/src/pages/pong/shared/components/` you see:

- `PageContainer` – generic container component with a `max` width and padding options, implemented using **generic props** and an `as` prop (see `Generics.md`).
- `PageSection` – section wrapper with configurable vertical spacing (`space`).
- `SurfaceCard` – a polymorphic card UI component with an `as` prop.
- `Scoreboard`, `BackgroundVideo`, `PlayingView` – presentational components for Pong UI.

These components are pure React:

- They accept props and render JSX.
- They are reused across Local and Online modes for consistent layout.

---

## 4. Local Pong game (`LocalGame.tsx`)

File: `apps/frontend/src/pages/pong/local/LocalGame.tsx`.

This component wires together:

- React state and effects.
- Custom hooks for settings, game runtime, AI bot, keyboard shortcuts, match end handling, and body classes.
- Global context (`useSnackbar`, `useSetMatchActivity`).

### 4.1 Local state and refs

At the top:

- `const navigate = useNavigate();` – React Router hook for navigation.
- `const canvasRef = useRef<HTMLCanvasElement | null>(null);` – ref to the Pong canvas DOM node.
- `const [isPlaying, setIsPlaying] = useState(false);` – whether the game is currently playing.
- `const [aiEnabled, setAiEnabled] = useState(false);` – enable/disable AI bot.
- `const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('normal');`.
- `const [postMatch, setPostMatch] = useState<MatchSummary | null>(null);`.

These `useState` calls manage UI/game state that belongs to the Local Pong screen.

### 4.2 Custom hooks: settings, runtime, AI

Local settings:

- `const { settings, update, save, reset, resetRules, restore } = useLocalSettings();`
- Encapsulates local storage, default rules, and update logic.

Game runtime:

- `const { runtimeRef, ready } = usePongRuntime({ playing: isPlaying, canvasRef, settings, onBootstrapFailed });`
- This hook knows how to initialize and manage the actual Pong engine in the canvas.

AI bot:

- `useAIBot({ enabled: aiEnabled, playing: isPlaying, difficulty: botDifficulty, canvasRef, runtimeRef, runtimeReady: ready, botSeat });`
- The hook attaches or detaches AI logic based on state.

Keyboard quit + body class:

- `useKeyboardQuit(isPlaying, handleQuit);` – listen for a key (like Escape) to exit the game.
- `useBodyClass('pong-playing', isPlaying);` – toggles a CSS class on `<body>` while playing.

Match end:

- `useLocalMatchEnd({ canvasRef, playing: isPlaying, onSummary: (summary) => setPostMatch(summary), onAutoExit: () => setIsPlaying(false) });`
- Handles match end events and updates `postMatch` state.

### 4.3 Effects and context updates

Local game updates the **global match activity context**:

```tsx
const setMatchActive = useSetMatchActivity();

useEffect(() => {
  setMatchActive(isPlaying);
  return () => setMatchActive(false);
}, [isPlaying, setMatchActive]);
```

So `useMatchActivity()` (used in `App.tsx`) knows if a match is active to disable chat.

### 4.4 Callbacks for user actions

To avoid recreating functions on every render and to capture state correctly, `LocalGame` uses `useCallback`:

- `handleBootstrapFailed` – show snackbar on game bootstrap error.
- `handleSave` / `handleReset` – handle saving/resetting settings, and show snackbars.
- `handlePlay` – start the match (set `isPlaying`, clear `postMatch`, call runtime functions).
- `handleQuit` – stop playing, restore settings, navigate back to `/pong`.

React pattern:

- `useCallback` hooks declare stable handlers.
- These handlers are passed down to child components like `SettingsView` and `PlayingView`.

### 4.5 Render tree

`LocalGame` ultimately renders something like:

- A `PageContainer` / `PageSection` layout.
- A `SettingsView` when not playing, and a `PlayingView` while playing.
- A `PostMatchView` when `postMatch` is set.
- A `<canvas ref={canvasRef} />` inside `PlayingView` that the Pong runtime uses.

The exact JSX is more detailed, but the important React patterns are:

- Controlled state through `useState`.
- Complex behavior extracted into custom hooks.
- Context interaction via `useSnackbar()` and `useSetMatchActivity()`.

---

## 5. Online Pong game (`OnlineGame.tsx`) – high‑level React patterns

File: `apps/frontend/src/pages/pong/online/OnlineGame.tsx`.

This component is more complex, but the React patterns are the same:

- Local state and `useReducer` for lobby/match state machine.
- Heavy use of `useCallback` and `useEffect`.
- Custom hooks (`useMatchmakingClient`, `useGameBootstrap`, `useOnlineMatchEnd`, `useMatchOverEvent`, `useBodyClass`) to keep the component readable.

Some key patterns:

### 5.1 React state and reducer

The online game uses a reducer for complex state:

- `const [state, dispatch] = useReducer(onlineReducer, initialState);`
- Actions: `joinQueue`, `leaveQueue`, `matchFound`, `handoff`, `startPlaying`, `postmatch`, etc.

This keeps the **state transitions** centralized and easier to reason about than many `useState` calls.

### 5.2 Context and side effects

Context hooks:

- `const { user, axios, setUser } = useAppContext();` – auth and HTTP client.
- `const { enqueueSnackbar } = useSnackbar();` – notifications.
- `const setMatchActive = useSetMatchActivity();` – global match activity.

Effect for match activity:

```tsx
const matchActive =
  state.status === 'starting' || state.status === 'playing' || state.status === 'postmatch';

useEffect(() => {
  setMatchActive(matchActive);
  return () => setMatchActive(false);
}, [matchActive, setMatchActive]);
```

This mirrors the local game pattern: global state about “match active” is updated based on internal status.

### 5.3 Connecting to matchmaking and handling errors

Handlers defined with `useCallback`:

- `handleAllocatorError`, `handleRatelimit` – show error snackbars.
- `handleAuthError` – refresh auth token if expired; otherwise show error and log user out.
- `handleConfirmation` – show confirmation UI.

These callbacks are passed into:

```tsx
const { joinQueue, leaveQueue, acceptMatch, declineMatch, confirmJoin } = useMatchmakingClient({
  dispatch,
  connectKey,
  requestReconnect: () => setConnectKey((key) => key + 1),
  enabled: matchmakingEnabled,
  onAuthError: handleAuthError,
  onAllocatorError: handleAllocatorError,
  onRatelimit: handleRatelimit,
  onConfirmation: handleConfirmation,
  onMatchTimeout: handleMatchTimeout,
  onMatchDeclined: handleMatchDeclined,
});
```

So the hook can call back into the component when network events occur.

### 5.4 Game bootstrap and match lifecycle

`useGameBootstrap` manages the actual Pong engine, similar to `usePongRuntime` in local mode:

- It receives `canvasRef`, `active`, `config`, and callbacks `onStarted`, `onEnded`.
- Internally, it uses async/await and error handling to bootstrap the world and attach listeners.

`useOnlineMatchEnd` handles the end of the match (showing post‑match UI, waiting for server summary, etc.).

`useMatchOverEvent` adds a **custom canvas event listener** for `'pong:matchOver'` and triggers callbacks when the game signals that the match has ended.

### 5.5 UI rendering

`OnlineGame` renders:

- An online lobby (`QueueControls`, `MatchFoundPanel`, `StatusBadge`).
- A `PlayingView` while in match.
- A `PostMatchOnlineView` after match end.

All of this is controlled by the current `state.status` and related state slices, using conditional rendering like:

```tsx
{state.status === 'idle' && <QueueControls ... />}
{state.status === 'searching' && <MatchFoundPanel ... />}
{state.status === 'playing' && <PlayingView ... />}
{state.status === 'postmatch' && <PostMatchOnlineView ... />}
```

React patterns:

- Use **conditional rendering** based on reducer state.
- Pass down callbacks (`onJoinQueue`, `onLeaveQueue`, `onAcceptMatch`, `onDeclineMatch`) to child components.

---

## 6. Summary of React patterns in this app

- **App bootstrap (`main.tsx`)**
  - Use `createRoot` and `<Browser>` router.
  - Wrap app in top‑level providers (`AppProvider`, `MatchActivityProvider`).

- **App shell (`App.tsx`)**
  - Manage global UI (chat, snackbars, sockets, presence) with providers.
  - Use `Routes`/`Route` for pages and nested routing for Pong.
  - Use `useAppContext` and `useMatchActivity` to tie user state and match activity into UI behavior.

- **Pong layout and shared UI**
  - `PongLayout` provides a shared navbar, background, and Suspense boundary.
  - Reusable layout components (`PageContainer`, `PageSection`, `SurfaceCard`) keep UI consistent.

- **Local game**
  - `LocalGame` uses `useState`, `useRef`, and many **custom hooks** to manage a self‑contained game flow.
  - Uses context (`useSnackbar`, `useSetMatchActivity`) to integrate with global UI and app state.

- **Online game**
  - `OnlineGame` uses `useReducer` for complex state and custom hooks for matchmaking and game bootstrap.
  - React glue code connects WebSocket events, auth, and Pong runtime while keeping UI declarative.

Understanding these patterns will make it much easier to:

- Add new pages to the app.
- Extend the Pong UI (new views, controls, or overlays).
- Introduce new global behaviors (contexts, providers) in a way that fits the existing React structure.
