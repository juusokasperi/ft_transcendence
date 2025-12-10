# Browser Concepts for ft_transcendence (Pong + App + Network)

This document is a **practical course on browser fundamentals** you need to understand this app—especially:

- The React frontend (`apps/frontend`)
- The Pong game (canvas, WebSockets, event loop)
- The online networking workflow (`docs/to0nsa/workflow/OnlinePongNetwork.md`)

You don’t need to become a browser internals expert; you just need a good mental model for how **JavaScript, the DOM, rendering, and networking** fit together.

We’ll cover:

1. What runs where: JS engine vs browser vs server
2. The DOM, layout, and rendering (how Pong appears on screen)
3. The event loop, timers, and animation
4. Browser networking: HTTP, WebSockets, and our online Pong flow
5. Security model: origin, cookies, tokens, and CORS (high level)
6. Storage and persistence (localStorage, resume tokens)
7. Browser APIs you see in this codebase
8. DevTools: how to debug issues related to Pong and networking

---

## 1. What runs where

In this project there are three main “places” where code runs:

- **Browser**:
  - Runs the React app (`apps/frontend`).
  - Handles DOM, CSS, canvas, WebSockets, localStorage, etc.
  - Executes bundled TypeScript/JavaScript.
- **Matchmaking / backend services**:
  - Node.js processes (Fastify, Redis) running on the server.
  - Handle authentication, matchmaking queues, tokens, etc.
- **Game nodes + gateway**:
  - Server‑side Pong simulation.
  - Gateway (`apps/game-gateway/index.ts`) terminates WebSockets and proxies to nodes.

Browser responsibilities in this project:

- Render pages and Pong UI (React + CSS + canvas).
- Capture input (keyboard/mouse) and forward it via WebSockets to game nodes.
- Maintain client‑side state (React state + localStorage for resume tokens).
- Manage connections to:
  - HTTP REST endpoints (login, profile, etc.).
  - WebSocket endpoints (`/matchmaking`, `/g/:roomId`).

Everything else (matchmaking, verifying tokens, running the authoritative Pong simulation) lives on the server side.

---

## 2. DOM, layout, and rendering

The **DOM** (Document Object Model) is the browser’s in‑memory tree of HTML elements. React manipulates this tree indirectly through its virtual DOM.

Examples in the app:

- `apps/frontend/src/main.tsx`:

  ```ts
  createRoot(document.getElementById('root')!).render(<App />);
  ```

  - The `<App />` React tree is mounted into the DOM element with `id="root"`.

- `PongLayout` (`apps/frontend/src/pages/pong/PongLayout.tsx`):
  - Renders a `Navbar`, `BackgroundVideo`, and a section that contains the Pong routes.
  - Uses Tailwind CSS classes to control layout (fixed positioning, scrollable main area, etc.).

- Shared components like `PageContainer`, `PageSection`, `SurfaceCard`:
  - Produce regular HTML elements (`<div>`, `<section>`, etc.) with classes for spacing and alignment.

### 2.1 Canvas and WebGL (Pong)

Pong itself is rendered to a **`<canvas>`** element:

- Local game: `LocalGame` passes a `canvasRef` to the Pong runtime (`usePongRuntime`).
- Online game: `OnlineGame` passes a `canvasRef` to `useGameBootstrap`, which loads the online Pong host.

Inside the render package (`@pong/render`):

- The app uses **Babylon.js**, a WebGL engine.
- Babylon draws the scene (table, paddles, ball, lights) on the `<canvas>` using the GPU.

From the browser’s point of view:

- The canvas is just a rectangle on the page.
- Babylon manages a WebGL context for that canvas and draws frames in response to time and input.

### 2.2 CSS, layout, and overlays

Pong UI uses:

- Tailwind CSS (utility classes) for padding, colors, borders, etc.
- A “shell” layout in `PongLayout`:
  - Fixed full‑screen container.
  - Background video behind content.
  - Foreground content in `PageContainer` and `PageSection`.

Understanding:

- **DOM elements** (divs, canvas, buttons) are your building blocks.
- **CSS classes** control how they look and where they sit.
- **React** is the tool you use to declare _what_ the DOM should look like; the **browser** actually renders it.

---

## 3. Event loop, timers, and animation

The browser JavaScript engine runs on a **single thread** (for our purposes). It uses an **event loop** to:

- Run synchronous code (one function after another).
- Schedule callbacks to run later (timers, I/O, animation frames).

In `docs/to0nsa/typescript/Asynchronous.md` you already have a deep dive on this. Here’s how it relates specifically to Pong and the app.

### 3.1 Timers and async behavior

Examples:

- Matchmaking / network UI:
  - `useQueueTimer` in `apps/frontend/src/pages/pong/online/hooks/useQueueTimer.ts` uses `setInterval` to keep track of how long you’ve been in the queue.
- Online match end:
  - `useOnlineMatchEnd` uses `window.setTimeout` to delay showing post‑match UI after the server sends a match result.
- Frontend utilities:
  - Various hooks and components use `setTimeout` for animations, transitions, and delayed clean‑up.

Conceptually:

- `setTimeout(fn, delay)` schedules `fn` to run later on the event loop.
- `requestAnimationFrame(fn)` schedules `fn` for the next animation frame (used internally by Babylon’s render loop).

### 3.2 Render loop for Pong

For the actual game:

- Babylon’s `engine.runRenderLoop(loop)` (see `packages/pong/render/src/client/engine/render-loop.ts`) uses `requestAnimationFrame` under the hood.
- Each frame:
  - Reads the current game state (from the server for online, from a local simulation for offline).
  - Updates positions of paddles and ball meshes.
  - Renders the scene to the canvas.

From the browser’s perspective:

- It calls your render callback once per frame (typically 60+ fps) via `requestAnimationFrame`.
- Your render code (Babylon) updates the WebGL canvas.

This is why blocking JavaScript (e.g., long loops on the main thread) would freeze both the UI and the game.

---

## 4. Networking in the browser

The browser provides multiple networking APIs:

- **HTTP** (via `fetch`, Axios used here).
- **WebSockets** for bidirectional streams (used for matchmaking and game traffic).

### 4.1 HTTP: REST endpoints and Axios

Throughout the app you see:

- `useAppContext()` exposing `axios`, configured with base URL and auth headers.
- HTTP calls for:
  - Authentication (`/api/auth/login`, `/api/auth/refresh`).
  - User profile and stats.
  - Misc. CRUD operations.

These are standard HTTP requests:

- Each is independent (request/response).
- They use cookies or headers (e.g. bearer token) for authentication.

### 4.2 WebSockets: matchmaking and game

For real‑time interaction, the browser uses **WebSockets**:

1. **Matchmaking WebSocket** (`/matchmaking`):
   - Client uses `new WebSocket(wsUrl('/matchmaking'))` in `apps/frontend/src/services/matchmaking.ts`.
   - Sends/receives JSON messages of type `MatchmakingClientMessage` / `MatchmakingMessage`.
   - Used for:
     - Joining/leaving the matchmaking queue.
     - Accepting or declining found matches.
     - Receiving `HANDOFF` instructions.
     - Tournament messages.

2. **Game WebSocket** (`/g/:roomId` via gateway):
   - The online Pong host (`@pong/render` online embed) creates a WebSocket connection to the game gateway.
   - The **join token** is passed via WebSocket subprotocols in the `Sec-WebSocket-Protocol` header.
   - The gateway validates the token and proxies to a game node.
   - This connection carries:
     - Player input (client → server).
     - State snapshots / tick updates (server → client).
     - Match end events and resume tokens.

The browser’s WebSocket API:

- `const socket = new WebSocket(url);`
- Events:
  - `socket.onopen`
  - `socket.onmessage`
  - `socket.onerror`
  - `socket.onclose`
- Methods:
  - `socket.send(string)` – raw text (we send JSON).
  - `socket.close()`.

In this project, we wrap this API in `createMatchmakingClient` and the Pong host code to keep application code clean.

---

## 5. Security basics: origin, cookies, tokens, CORS

You don’t need deep security knowledge to work on this app, but you should understand a few browser constraints.

### 5.1 Origin and same‑origin policy

An **origin** is `(protocol, host, port)`, e.g. `https://example.com:443`.

The browser’s **same‑origin policy**:

- Generally prevents JavaScript from reading responses or DOM of a different origin.
- Allows resources like images, scripts, styles from CDNs (with some rules), but script code still runs in the context of your page’s origin.

In this app:

- Frontend, gateway, and matchmaking are typically served under the same origin in production.
- If not, CORS and WebSocket origin checks must be configured correctly on the server side.

### 5.2 Cookies and tokens (high level)

Authentication flows:

- Browser stores cookies or tokens (depending on backend setup).
- Axios includes auth details automatically (e.g., via headers or cookies).
- Matchmaking server uses `handleAuth` to validate the client’s auth token.

Join/resume tokens:

- Generated by backend services (allocator, game server).
- Sent via WebSocket messages (`HANDOFF`, `RESUME_TOKEN`).
- Stored temporarily by the client (e.g., for resume flows).
- Verified **server‑side** (gateway + game node) based on shared secrets.

Browser rules:

- JavaScript cannot read HTTP‑only cookies.
- JavaScript can read localStorage and in‑memory variables; these are used for client‑side state and resume data.

---

## 6. Browser storage and persistence

Main storage options relevant here:

- **localStorage** – simple key/value store (string → string), persistent per origin.
- **sessionStorage** – similar, but cleared when the tab is closed.
- **In‑memory state** – React state, refs, etc., lost on reload.

In this project:

- Local Pong settings (local game) and possibly resume tokens are stored in localStorage.
- Helpers like `findAnyStoredResumeCandidate()` use localStorage to check if there is a match to resume.

Important properties:

- Synchronous API (can block if abused, but fine for small payloads).
- Data is isolated by origin.
- Great for small bits of state (user preferences, last mode used, resume tokens within TTL).

---

## 7. Browser APIs you see in this codebase

Some concrete APIs used throughout:

- **DOM selection**:
  - `document.getElementById('root')`.
  - In render code: `document.createElement`, `appendChild`, etc.

- **Canvas and WebGL**:
  - `HTMLCanvasElement`
  - WebGL context managed by Babylon.

- **Timers**:
  - `window.setTimeout`, `window.setInterval`, `window.clearTimeout`.
  - `requestAnimationFrame` via Babylon.

- **Events**:
  - DOM events: keyboard/mouse events for input.
  - Custom events: `'pong:matchOver'` dispatched on the canvas element, listened to by `useMatchOverEvent`.

    ```ts
    const handler = (event: Event) => {
      const detail = extractRef.current ? extractRef.current(event) : null;
      onMatchOverRef.current(detail);
      // ...
    };

    canvas.addEventListener('pong:matchOver', handler);
    ```

- **WebSockets**:
  - `WebSocket` constructor and event listeners in `createMatchmakingClient`.

- **`import.meta.env`**:
  - Vite’s way of exposing environment variables to the browser bundle.
  - Used to enable extra debugging logs in development (`if (import.meta.env?.DEV) { console.debug(...) }`).

---

## 8. DevTools: debugging Pong and network flows

Modern browsers (Chrome, Firefox, etc.) ship with DevTools. For this project they are essential for:

- **Elements** panel:
  - Inspect the DOM tree (Pong layout, canvas element).
  - Check CSS (e.g., why something is hidden or overlapping).

- **Console**:
  - View logs from `console.debug('[OnlineGame]', ...)`.
  - See errors from network calls, WebSocket failures, or runtime exceptions.

- **Network tab**:
  - `XHR/Fetch`:
    - Inspect API calls from Axios (status codes, payloads).
  - **WS (WebSocket)** tab:
    - Inspect `/matchmaking`:
      - See `JOIN_QUEUE`, `MATCH_FOUND`, `HANDOFF`, etc.
    - Inspect `/g/:roomId`:
      - Watch game messages (often more opaque since they may be binary/optimized).

- **Application/Storage**:
  - Inspect localStorage keys used by resume logic or settings.
  - Clear stored data when debugging edge cases.

---

## 9. How this all fits together (mental model)

When you work on this project, you can think of the browser as doing three main jobs:

1. **UI and rendering**
   - React + DOM for structure (pages, layouts, chat, settings).
   - CSS + Tailwind for layout and styling.
   - Canvas + WebGL (via Babylon) for Pong graphics.

2. **State and orchestration**
   - React hooks (`useState`, `useReducer`, `useEffect`) for UI state and side effects.
   - Contexts (`AppContext`, `MatchActivityContext`, `SnackbarContext`, etc.) for shared state across components.
   - LocalStorage for small bits of persistent state (settings, resume).

3. **Networking**
   - Axios + HTTP for normal API calls (auth, profile, stats).
   - WebSockets for low‑latency matchmaking and game traffic.
   - Coordination with backend services via well‑typed protocols (see `protocol/net.ts` and `OnlinePongNetwork.md`).

If you keep this mental picture in mind while reading code, it becomes much easier to:

- Understand where a bug might live (browser vs matchmaking vs gateway vs game node).
- Add new features (e.g., new UI around online queue, new match overlays in Pong).
- Reason about performance (avoid blocking the main thread, avoid unnecessary re‑renders).

You can cross‑reference:

- `docs/to0nsa/react/React.md` for how React structures the UI.
- `docs/to0nsa/typescript/Asynchronous.md` for async/await and timers.
- `docs/to0nsa/workflow/OnlinePongNetwork.md` for the detailed online network flow.

Together, these give you a solid foundation for working comfortably on the browser side of ft_transcendence.
