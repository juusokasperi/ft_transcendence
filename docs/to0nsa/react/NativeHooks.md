# Native React Hooks in ft_transcendence – How and Why They’re Used

This is a practical course on the **built‑in React hooks** you see in this project (`useState`, `useEffect`, `useReducer`, etc.), focused on:

- What each hook is for in general.
- How it shows up in the ft_transcendence frontend (with file references).
- When to prefer one hook over another while working on this codebase.

It’s a companion to:

- `React.md` – overall React structure and patterns in the app.
- `hooks-index.md` – project‑specific custom hooks (`useMatchmakingClient`, `useGameBootstrap`, etc.).

---

## 1. `useState` – local component state

**What it is:**  
`useState` gives a component private, reactive state (numbers, strings, objects, booleans, etc.) that persists between renders.

**Typical pattern:**

```tsx
const [chatOpen, setChatOpen] = useState(false);
```

**Where it’s used here:**

- `apps/frontend/src/App.tsx` – to track whether the chat panel is open (`chatOpen`).
- `OnlineGame.tsx` – to keep small UI flags like confirmation dialogs.
- Many form and UI components (inputs, toggles, simple view switches).

**When to use it in this repo:**

- Small, purely local UI concerns (a toggle, an open/closed panel, input values).
- When the state doesn’t need to be shared across unrelated components (if it does, consider context).

---

## 2. `useEffect` – reacting to changes and side‑effects

**What it is:**  
`useEffect` lets you run **side‑effects** after React has updated the DOM: subscriptions, timers, network calls, class toggles, etc.

**Typical pattern:**

```tsx
useEffect(() => {
  if (!chatUiEnabled && chatOpen) setChatOpen(false);
}, [chatUiEnabled, chatOpen]);
```

**Where it’s used here:**

- `App.tsx` – automatically closes chat when `chatUiEnabled` becomes false (e.g. match starts or user logs out).
- `OnlineGame.tsx` – auto‑resume attempts, reacting to location changes, syncing match activity into `MatchActivityContext`.
- Custom hooks:
  - `useMatchmakingClient` – manages the lifecycle of the matchmaking WebSocket.
  - `useGameBootstrap` – bootstraps/destroys the online Pong app when `active` and `config` change.
  - `useQueueTimer` – runs a timer while in queue.
  - `useBodyClass` – adds/removes a CSS class on `<body>` while active.

**When to use it in this repo:**

- You need to **subscribe or set something up** when a component mounts, and clean it up when it unmounts or dependencies change (WebSockets, timers, event listeners).
- You need to **keep an external system in sync** with React state (e.g., body class, localStorage writes).

> Tip: keep effects focused and avoid putting unrelated logic into one `useEffect`. That keeps behavior easier to reason about while debugging online flows.

---

## 3. `useRef` – mutable boxes and DOM references

**What it is:**  
`useRef` gives you a mutable object (`{ current: ... }`) that:

- **Does not trigger re‑renders** when it changes.
- Survives across renders.
- Often holds DOM nodes (`HTMLCanvasElement`, input elements) or “instance” values.

**Typical patterns:**

```tsx
const canvasRef = useRef<HTMLCanvasElement | null>(null); // DOM ref
const bootingRef = useRef(false); // mutable flag
```

**Where it’s used here:**

- `OnlineGame.tsx` – `canvasRef` for the Pong canvas; `skipAutoResumeRef` to gate auto‑resume behavior.
- `useGameBootstrap` – `appRef` holds the current Pong app instance; `bootingRef` prevents double‑bootstrap.
- `useMatchmakingClient` – keeps track of the current client instance, pending join status, and reconnect callbacks without rerendering.
- `RealtimeSocketContext` – stores the WebSocket instance (`wsRef`) and message handlers.
- `useMatchOverEvent` – holds the current extractor and handler as refs so listeners stay up‑to‑date.

**When to use it in this repo:**

- You need to hold onto a **canvas** or other DOM element (for Babylon / Pong bootstrapping).
- You need a **mutable flag** or object that shouldn’t cause a React re‑render (e.g., “am I booting?”).
- You need to store an **imperative handle** (WebSocket, timer ID, game instance).

---

## 4. `useReducer` – state machines and complex local state

**What it is:**  
`useReducer` is like `useState`, but better for **complex state** or explicit **state machines**:

- You define a reducer `(state, action) => newState`.
- The component dispatches actions instead of manually updating fields.

**Typical pattern:**

```tsx
const [state, dispatch] = useReducer(reducer, initialState);
```

**Where it’s used here:**

- `OnlineGame.tsx` – main online matchmaking/game state machine:
  - Handles statuses like `'idle'`, `'connecting'`, `'in_queue'`, `'match_found'`, `'starting'`, `'playing'`, `'postmatch'`.
  - Reacts to actions from `useMatchmakingClient` (e.g. `matchFound`, `handoff`, `matchTimeout`) and from match end hooks.
- Tournament hooks and controllers may use reducers for their own state machines.

**When to use it in this repo:**

- You’re modelling a **workflow** (e.g. matchmaking, tournament pages) with clear states and transitions.
- Multiple events (WebSocket messages, user actions, timers) can affect one piece of state.
- You want easier reasoning and debugging by centralizing logic in a reducer.

> In practice, if you find yourself juggling several `useState` variables that always change together for networking logic or match steps, consider a `useReducer` instead.

---

## 5. `useContext` (via `useXContext` helpers)

**What it is:**  
`useContext(SomeContext)` lets a component read values from a React context provider (**no prop drilling**).

**How it appears in this project:**

- You rarely see raw `useContext` calls. Instead you see:
  - `useAppContext()` – wraps `useContext(AppContext)`.
  - `useSnackbar()` – wraps `SnackbarContext`.
  - `useRealtimeSocket()` – wraps `RealtimeSocketContext`.
  - `usePresence()`, `useChatContext()`, `useMatchActivity()` – similar wrappers.

**Where it’s used here:**

- `App.tsx` and most pages – `useAppContext` for user, navigation, and Axios.
- `OnlineGame.tsx` – `useAppContext`, `useSnackbar`, `useSetMatchActivity`.
- Chat and presence UIs – corresponding context hooks.

**When to use it in this repo:**

- Whenever you need global app data (user, tokens, navigation, sockets, presence, match activity, snackbars).
- Prefer existing `useXContext` helpers over calling `useContext` directly; it keeps consumers decoupled from context implementation details.

---

## 6. `useMemo` – derived values and performance

**What it is:**  
`useMemo` memoizes a **derived value**: React will recompute it only when its dependencies change.

**Typical pattern:**

```tsx
const liveMessage = useMemo(() => {
  switch (state.status) {
    case 'connecting':
      return 'Connecting to matchmaking.';
    // ...
    default:
      return '';
  }
}, [state.status, state.opponent.username]);
```

**Where it’s used here:**

- `OnlineGame.tsx` – to compute accessibility/live region messages (`liveMessage`) based on status and opponent name without recalculating on irrelevant changes.
- Other components where derived data is a small transform of props or state.

**When to use it in this repo:**

- Derived values that are **expensive** to compute or you want to keep **stable** to avoid unnecessary child renders.
- Rendering helper values used in JSX that depend on a subset of state/props.

> For simple, cheap computations, you don’t need `useMemo`. Use it when it helps with correctness (stable refs) or performance.

---

## 7. `useCallback` – stable function references

**What it is:**  
`useCallback` memoizes a **function** so its identity stays stable across renders unless dependencies change.

**Typical pattern:**

```tsx
const handleJoinQueue = useCallback(() => {
  joinQueue();
}, [joinQueue]);
```

**Where it’s used here:**

- `OnlineGame.tsx` – for event handlers:
  - `handleMatchDeclined`, `handleMatchTimeout`, `handleAuthError`, `handleAllocatorError`, `handleJoinQueue`, etc.
  - Keeps handlers stable when passed to children, avoiding unnecessary re‑renders or effect re‑runs.
- Hooks like `useMatchmakingClient` – returning stable functions (`joinQueue`, `leaveQueue`, etc.) so callers don’t worry about re‑creation on each render.

**When to use it in this repo:**

- Passing handlers to deeply nested components or hooks that rely on reference equality (e.g. dependencies in `useEffect`).
- Avoiding infinite loops where an effect depends on a callback that would otherwise be redefined on every render.

> You don’t need `useCallback` for every function. Use it when a function is part of a dependency array or passed to performance‑critical children.

---

## 8. Other hooks you might encounter

The majority of the app uses the hooks above. Occasionally you may also see:

- `useLayoutEffect` – similar to `useEffect`, but fires **synchronously after DOM mutations** and before the browser paints. Use sparingly; in this project, most DOM‑related work is fine in `useEffect`.
- `useId`, `useTransition`, etc. – not widely used in this codebase as of now. If they appear later, follow the same pattern: understand the general React behavior, then look at how it is applied in a specific component.

---

## 9. How to practice with these hooks in this repo

If you want concrete examples to reinforce these concepts:

- **Follow `OnlineGame.tsx`**
  - Identify where `useState`, `useReducer`, `useEffect`, `useMemo`, `useCallback`, and `useRef` appear.
  - Cross‑reference with this doc to remind yourself _why_ each hook is used there.

- **Look at custom hooks in `hooks-index.md`**
  - Many custom hooks (e.g. `useMatchmakingClient`, `useGameBootstrap`) are “mini‑courses” in combining native hooks to solve a real problem (WebSockets, async bootstrapping, state machines).

Together with `React.md`, this should give you a solid mental model for both **native React hooks** and the **project‑specific hooks** built on top of them.
