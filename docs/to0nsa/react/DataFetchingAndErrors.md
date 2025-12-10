# Data Fetching & Error Handling in the React App

This document explains **how frontend code talks to the backend** and how it handles errors and loading states, so you can follow and extend existing patterns without reinventing them.

It focuses on:

- The shared Axios client (`AppContext`) and token refresh behavior.
- Typical data‑fetching patterns in pages and hooks.
- How errors are surfaced to users (snackbars) vs silently handled.
- Auth‑specific error handling in online flow and forms.

---

## 1. Shared Axios client and auth behavior

**File:** `apps/frontend/src/context/AppContext.tsx`  
**Hook:** `useAppContext()`

All HTTP calls should go through the **shared Axios instance** provided by `AppContext`:

- `axios.defaults.withCredentials = true;` – cookies (access/refresh tokens) are sent by default.
- On app startup:
  - `AppProvider` calls `axios.get('/api/users/me')`:
    - If successful, it normalizes and stores the user in context.
    - If it fails with 401, it sets `user = null`.
  - Sets `userReady = true` once the check is done.

### 1.1 Automatic token refresh on 401

`AppContext` registers a **response interceptor**:

- If a response is 401 with `code === 'token_expired'`:
  - It calls `/api/auth/refresh` exactly once (shared via `refreshPromiseRef`).
  - Retries the original request with a `_retry` flag.
- If refresh fails or a second 401 happens:
  - It logs the user out (`performClientLogout`), clears user state, and navigates to `/`.

This means:

- Normal components just use `axios` from `useAppContext()` and don’t worry about refresh tokens.
- For 401s **other than** expired tokens, the error is passed through to the caller.

---

## 2. Common data‑fetching pattern

Typical pattern for fetching data in a component:

```tsx
const { axios } = useAppContext();
const [data, setData] = useState<Something | null>(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

useEffect(() => {
  let mounted = true;

  (async () => {
    try {
      const res = await axios.get('/api/some-endpoint');
      if (!mounted) return;
      setData(res.data);
      setError(null);
    } catch (err) {
      if (!mounted) return;
      setError('Failed to load data');
    } finally {
      if (mounted) setLoading(false);
    }
  })();

  return () => {
    mounted = false;
  };
}, [axios]);
```

Variants of this pattern appear in:

- `Home.tsx` – fetch live stats from `/api/status/live` with periodic refresh.
- `Profile.tsx` – refresh `/api/users/me` to get up‑to‑date wins/losses.
- `Stats.tsx` – fetch aggregated stats and match history.
- Tournament hooks – fetch tournament lists and state as needed.

Key points:

- Use a `mounted` flag to avoid setting state on unmounted components.
- Store `loading` and `error` alongside `data`.
- In many places, errors are **soft** (just set a flag and adjust the UI), not shown as toasts.

---

## 3. Showing errors to users: `useSnackbar`

**File:** `apps/frontend/src/context/SnackbarContext.tsx`  
**Hook:** `useSnackbar()`

For user‑visible errors or status messages, components use:

```tsx
const { enqueueSnackbar } = useSnackbar();

enqueueSnackbar({
  message: 'Something went wrong',
  variant: 'error', // or 'success' | 'info' | 'warning'
});
```

Common cases:

- `LocalGame.tsx` – if local Pong bootstrap fails, show a snackbar: “Failed to start the game”.
- `OnlineGame.tsx` – for matchmaking errors:
  - Auth errors (“Authentication error. Please sign in again.”).
  - Allocator errors (“No available game servers right now.”).
  - Rate‑limit errors (“You are sending messages too fast.”).
  - Match timeouts/declines.
- `Login.tsx` – to show login/2FA errors.
- `DeleteUser.tsx`, `ConfirmEmail.tsx`, `ResetPassword.tsx`, etc. – to show success/error after form submits.

Guideline:

- Use snackbars for **events the user must notice** (auth issues, form failures, major networking problems).
- Use inline text/labels for **field‑level validation errors** (e.g. invalid email, 2FA code).

---

## 4. Auth‑related data fetching and guards

### 4.1 `useRequireAuth` – route guard

**File:** `apps/frontend/src/hooks/useRequireAuth.tsx`

Pattern:

```tsx
const { user, userReady, navigate } = useAppContext();
useEffect(() => {
  if (userReady && !user) {
    navigate('/');
  }
}, [user, userReady, navigate]);
```

Used for pages that must not be visible to unauthenticated users.

### 4.2 Forms that call auth endpoints

Example: `Login.tsx`:

- On submit:
  - `axios.post('/api/login', { usernameOrEmail, password })`.
  - If backend responds with a 2FA challenge, it switches UI to a “enter 2FA code” form.
  - Otherwise, it normalizes the returned user and calls `login(...)` from `AppContext`.
  - Errors are handled by catching `AxiosError` and showing a snackbar or field‑level error:

    ```tsx
    const axiosErr = err as AxiosError<{ message?: string }>;
    enqueueSnackbar({
      message: String(axiosErr?.response?.data?.message ?? err?.message ?? 'Login failed'),
      variant: 'error',
    });
    ```

Similar patterns appear in:

- `Registration.tsx` – signup calls followed by navigation or error display.
- `ForgotPassword.tsx` / `ResetPassword.tsx` – POSTing to `/api/reset-password` endpoints.
- `ConfirmEmail.tsx` – validating signup tokens.

### 4.3 Online flow auth handling

In `OnlineGame.tsx`:

- `handleAuthError` is passed to `useMatchmakingClient` and called when matchmaking reports auth issues:

  ```tsx
  const handleAuthError = useCallback(
    async (message?: string) => {
      const fallbackMessage = message ?? 'Authentication error. Please sign in again.';
      if (message === 'Token expired') {
        try {
          await axios.post('/api/auth/refresh');
          setConnectKey((key) => key + 1);
          return;
        } catch (err) {
          debugLog('[OnlineGame] Failed to refresh auth token', err);
        }
      }

      enqueueSnackbar({ message: fallbackMessage, variant: 'error' });
      setUser(null);
    },
    [axios, enqueueSnackbar, navigate],
  );
  ```

- This is a **manual fallback** path when the matchmaking WS reports auth issues that the Axios interceptor can’t handle (because it’s not an HTTP response).

---

## 5. Network errors in online/tournament flows

For online and tournaments, many errors surface through WebSocket messages or timeouts rather than HTTP responses.

Patterns:

- **Matchmaking errors** (`useMatchmakingClient`):
  - When server sends `ERROR` with `code: 'ALLOCATOR'`, `onAllocatorError` is called to show a snackbar.
  - For `code: 'RATELIMIT'`, a ratelimit snackbar is shown.
  - For `code: 'AUTH'`, `handleAuthError` is invoked as above.

- **Allocator / game server availability**:
  - Allocator errors (503, etc.) become `ERROR` messages on matchmaking WS; the client shows a user‑friendly message about servers being busy.

- **Tournament page**:
  - `useTournamentPageController` exposes loading flags and falls back to spinner or message components when data is missing or delayed.
  - Errors fetching tournament data are typically handled by showing empty views or messages like “Unable to load tournaments” rather than hard failures.

Guideline:

- For **streaming/WebSocket flows**, convert low‑level error codes into:
  - State machine transitions (e.g. back to `'idle'`).
  - Human‑readable snackbars when appropriate.

---

## 6. Silent vs noisy failures

In this codebase, errors are handled with different “loudness” depending on context:

- **Silent/soft failures (no snackbar):**
  - Background refresh of user data on `Profile` – failures are logged/ignored; the app continues using existing user data.
  - Live stats on `Home` – if `/api/status/live` fails, component shows “Live data unavailable”.
  - Non‑critical stats fetches where fallback UI is acceptable.

- **Noisy failures (snackbar or explicit message):**
  - Login/signup/reset failures.
  - Online matchmaking issues (auth, allocator, ratelimit).
  - Local/online Pong bootstrap failures.
  - Actions that directly follow user interaction (button click → API call).

When adding new data‑fetching code:

- Decide whether the user needs an explicit message or if a degraded UI is acceptable.
- Match existing patterns in similar screens (e.g., follow how `Stats.tsx` handles loading and empty states for new stats views).

---

## 7. Summary and recommendations

- Use `useAppContext().axios` for all HTTP calls to benefit from shared config and token refresh.
- Wrap fetches in `useEffect` with `mounted` flags, track `loading` and `error` alongside `data`.
- Use `useSnackbar` for user‑visible failures or confirmations; use inline text for field‑level errors.
- For WebSocket‑driven features (online, tournaments, chat), handle protocol‑level errors in hooks (`useMatchmakingClient`, tournament hooks) and convert them into state + snackbars.
- Keep behavior consistent with existing pages by following patterns in `Home.tsx`, `Profile.tsx`, `Stats.tsx`, `OnlineGame.tsx`, and the auth pages.

