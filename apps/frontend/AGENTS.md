# AGENTS – Frontend (React / Vite)

Scope: applies to everything under `apps/frontend/`.

The frontend is a React/Vite app that drives the Pong UI, online flow, tournaments, chat, and account management. These guidelines keep it consistent and easy to extend.

---

## 1. Architecture and file layout

- Keep to the existing structure:
  - `src/pages/` – route entrypoints.
  - `src/components/` – reusable UI components.
  - `src/context/` – React contexts (AppContext, Snackbar, RealtimeSocket, MatchActivity, etc.).
  - `src/games/pong/` – Pong‑specific game host logic, rendering, and modes.
  - `src/pages/pong/*/hooks` / `state` / `components` – per‑mode hooks and state machines.
- When adding new features:
  - Prefer co‑locating hooks, components, and state under the relevant page/module.
  - Reuse existing patterns (e.g. `useXConnection`, `useXPageController`) instead of inventing new naming schemes.

---

## 2. React & TypeScript conventions

- Use **function components** with hooks; do not introduce class components.
- Prefer:
  - `useState` / `useReducer` for local state.
  - `useMemo` / `useCallback` to avoid unnecessary recomputation and re‑renders where needed.
  - `useEffect` with proper dependency arrays and cleanup.
- Types:
  - Use explicit props and state types; avoid `any`.
  - Reuse shared types from `@pong/shared` and local `types.ts` files instead of re‑typing messages or shapes.
  - For context values, define explicit interfaces and avoid large “grab bag” contexts.

---

## 3. Networking, sockets, and error handling

- HTTP:
  - Always use the shared Axios instance from `useAppContext()` so token refresh and base config apply.
  - Follow the patterns described in `docs/to0nsa/react/DataFetchingAndErrors.md`.
- WebSockets:
  - For matchmaking/tournaments, use `createMatchmakingClient` and hooks like `useMatchmakingClient` / `useTournamentConnection`.
  - For chat, use `RealtimeSocketContext`.
  - For game connections, use `connectOnline` (and related helpers) instead of opening raw `WebSocket` instances.
- Errors:
  - Convert low‑level errors into meaningful snackbars or inline messages.
  - Use `useSnackbar()` for user‑visible errors; match existing wording where appropriate.
  - When you introduce new error codes or states, update:
    - `docs/to0nsa/workflow/FailureModesAndUX.md`.
    - Any relevant React docs under `docs/to0nsa/react/`.

---

## 4. UI, layout, and styling

- Use existing layout components:
  - `PongLayout`, `PageContainer`, `PageSection`, `SurfaceCard`, etc.
  - Follow established layout patterns in Pong pages (header + content, match area vs side panels).
- Styling:
  - Follow current Tailwind and className patterns; do not introduce new CSS frameworks.
  - Prefer composable UI components over one‑off large components.
  - Keep components small and focused; extract reusable pieces when UI gets complex.

---

## 5. State machines and complex flows

- For multi‑step flows (online, tournaments), keep state in:
  - Reducers (`reducer` + `initialState` in `state/machine.ts` or `tournamentReducer`).
  - Dedicated hooks (`useGameBootstrap`, `useOnlineMatchEnd`, `useTournamentPageController`).
- When extending flows:
  - Add new actions and branches to the existing reducers instead of sprinkling ad‑hoc state flags.
  - Keep transitions explicit and test them where possible.
  - Update the corresponding “course” docs under `docs/to0nsa/workflow` or `docs/to0nsa/tournament` to describe new states.

---

## 6. Testing and dev workflows

- Use existing testing setup (Vitest) for new unit/component tests; see other tests under `apps/frontend/src/pages/pong/tournament/__tests__` as examples.
- Dev:
  - Run frontend in dev mode with `pnpm run dev` or `pnpm run dev:frontend`.
  - Use the browser devtools + React DevTools to debug state and WS traffic.
- Do not add new test frameworks; extend Vitest and current patterns.
