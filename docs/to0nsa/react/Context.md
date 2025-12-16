# React Contexts in ft_transcendence – Global State and Services

This document explains the **main React contexts** used in the frontend, how they fit together, and when to use them instead of local component state.

It’s a companion to:

- `React.md` – overall app and routing structure.
- `NativeHooks.md` – how built‑in hooks are used.
- `hooks-index.md` – index of project‑specific hooks built on top of these contexts.

---

## 1. AppContext – user, navigation, and Axios

**File:** `apps/frontend/src/context/AppContext.tsx`  
**Hook:** `useAppContext()`

**What it provides:**

- `user: User | null` – current logged‑in user (username, uuid, avatar, stats summary, etc.).
- `userReady: boolean` – true when the initial `/api/users/me` check has completed.
- `setUser(user | null)` – manually update the user (e.g. after login).
- `login(user)` – store a user after a successful login.
- `logout()` – call `/api/logout` and clear user state, navigate to `/`.
- `axios: AxiosInstance` – preconfigured Axios client:
  - Sends cookies (`withCredentials`).
  - Adds a response interceptor to refresh access tokens on 401 (`token_expired`) by calling `/api/auth/refresh`.
  - Logs the user out if refresh fails.
- `navigate` – wrapper around React Router’s `useNavigate` for programmatic navigation.

**Where it’s used:**

- `App.tsx` – to read `user` and decide when chat UI should be available.
- `OnlineGame.tsx` and other pages – to get `axios`, `navigate`, and `setUser` for auth‑related flows and API calls.

**When to use it:**

- Any time you need the **current user**, a **logged‑in guard**, or to call backend REST APIs.
- For navigation from inside components (`navigate('/pong')`, etc.).

---

## 2. SnackbarContext – global notifications

**File:** `apps/frontend/src/context/SnackbarContext.tsx`  
**Hook:** `useSnackbar()`

**What it provides:**

- `enqueueSnackbar({ message, variant })` – show a transient toast/snackbar.
  - `variant` typically indicates style (`'success' | 'error' | 'info' | 'warning'`).
- `closeSnackbar(id?)` – close one or all snackbars.

**Where it’s used:**

- `OnlineGame.tsx` and `useOnlineMatchEnd` – to show errors and match results (auth errors, ratelimit, allocator errors, win/lose messages).
- Various pages and forms – to show success/error messages after API calls.

**When to use it:**

- Any user‑facing feedback that isn’t tied to a specific component’s lifecycle (e.g. “Match declined or unavailable.”, “Authentication error. Please sign in again.”).

---

## 3. RealtimeSocketContext – shared `/chat` WebSocket

**File:** `apps/frontend/src/context/RealtimeSocketContext.tsx`  
**Hook:** `useRealtimeSocket()`

**What it provides:**

- `send(payload)` – send a JSON payload over the `/chat` WebSocket.
- `subscribe(handler)` – register a callback for incoming messages; returns `unsubscribe`.
- `readyState` – current `WebSocket.readyState`.
- `isConnected` – boolean shortcut for “chat socket is fully ready”.

Internally it:

- Opens a `WebSocket` to `/chat` when a user is logged in.
- Waits for a `blockedList` message before declaring the connection “ready”.
- Automatically reconnects or closes when the user logs out.

**Where it’s used:**

- `ChatContext` – to implement higher‑level chat features on top of the raw socket.
- Components that need raw realtime messages (rare; usually they go through `ChatContext`).

**When to use it:**

- When building features that live on top of the **chat WebSocket transport** (presence, simple realtime signals) and you don’t need the full chat abstraction.
- Most chat UI should prefer `useChatContext()` instead.

---

## 4. PresenceContext – online/offline status

**File:** `apps/frontend/src/context/PresenceContext.tsx`  
**Hook:** `usePresence()`

**What it provides:**

- `users` – a map/list of users with presence info (online/offline, last seen).
- Possibly helper methods to interpret presence states or broadcast presence‑related events.

It subscribes to specific messages coming from the realtime socket and maintains a canonical list of presence records.

**Where it’s used:**

- Chat UI – to show green “online” dots, user lists, and presence badges.
- Any part of the UI that needs to know if a friend/opponent is currently online.

**When to use it:**

- Whenever you need **presence information** (who’s online, who’s not) outside a single component’s local state.

---

## 5. ChatContext – chat channels, messages, and invites

**File:** `apps/frontend/src/context/ChatContext.tsx`  
**Hook:** `useChatContext()`

**What it provides (high level):**

- `messages: ChatMessage[]` – messages for the current channel (public and private).
- `sendChatMessage(message, options?)` – send a chat or private message.
- `sendPayload(payload)` – low‑level send for custom payloads.
- `blocked: Set<string>` (indirectly via API) – who the current user has blocked.
- `pendingInvites` and helpers – manage game invites started from chat.
- `inviteAcceptedSignal` / `acknowledgeInviteAcceptedSignal` – a simple signal mechanism for “an invite was accepted”.
- `lastSeenPrivateMessageCountRef` – mutable ref to track unread DMs.

Internally it:

- Uses `useRealtimeSocket()` to send/receive messages (`chat`, `privateMessage`, `joinChannel`, `inviteUser`, etc.).
- Integrates with `usePresence()` to show presence inside the chat UI.
- Implements message cooldowns to avoid spam.
- Resets its state when the channel or user changes.

**Where it’s used:**

- `Chat` component and related UI – to render messages, send input, show invites, block/unblock.
- Invite‑to‑match flows that start from chat.

**When to use it:**

- Whenever a component is part of the **chat UI** or needs to interact with chat/invite features (e.g. a small chat preview, invite badges).

---

## 6. MatchActivityContext – whether a match is active

**File:** `apps/frontend/src/context/MatchActivityContext.tsx`  
**Hooks:** `useMatchActivity()`, `useSetMatchActivity()`

**What it provides:**

- `useMatchActivity()` – read‑only boolean: is a Pong match currently active?
- `useSetMatchActivity()` – function to set that boolean.

**Where it’s used:**

- `App.tsx`:
  - Reads `matchActive = useMatchActivity()`.
  - Combines it with `user` to decide if chat UI should be enabled:
    - `chatUiEnabled = Boolean(user && !matchActive)`.
  - If `matchActive` flips to true, ensures chat is closed.
- `OnlineGame.tsx` and local Pong pages:
  - Call `useSetMatchActivity()` to mark matches active/inactive when they start/finish.

**When to use it:**

- Any feature that needs to know “am I currently in a match?” to change behavior globally (e.g. disable chat, adjust layout, show overlays).

---

## 7. SidebarContext – sidebar open/close state

**File:** `apps/frontend/src/context/SidebarContext.tsx`  
**Hooks:** `useSidebar()`, `useSidebarToggle()` (pattern inferred from file)

**What it provides:**

- A small piece of global UI state for whether the main sidebar is open or closed.
- Toggle/open/close helpers used by header/buttons.

**Where it’s used:**

- Layout components containing the navigation sidebar.

**When to use it:**

- When building or updating components that interact with the **main sidebar** (e.g. a menu button in the navbar).

---

## 8. How these contexts are composed

Top‑level composition (from `apps/frontend/src/main.tsx` and `App.tsx`):

- `AppProvider` (AppContext) – user, Axios, navigation.
- `MatchActivityProvider` (MatchActivityContext) – match active flag.
- `SidebarProvider` (SidebarContext).
- `SnackbarProvider` (SnackbarContext).
- `RealtimeSocketProvider` (RealtimeSocketContext) – `/chat` WebSocket.
- `PresenceProvider` (PresenceContext).
- `ChatProvider` (ChatContext) – channel, messages, invites.

These providers wrap your routes so any page/component can reach them via their corresponding `useX` hooks.

---

## 9. When to choose context vs local state

Use **context** when:

- Multiple, possibly distant components need access to the **same data** (user, presence, chat, match activity).
- The data is **long‑lived for the session** (auth, socket connections, layout state).
- Changes should affect global behavior (e.g. logging out, starting a match).

Use **local state (useState/useReducer)** when:

- The data only matters to a specific component or a small subtree.
- It represents transient UI details (input text, which tab is open on a single page).

In this app, the rule of thumb is:

- **Auth, networking, and “session‑level” concerns → contexts.**
- **Per‑screen UI and small interactions → local state in that screen.**
