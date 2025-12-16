# AGENTS – Apps (Node Services & Frontend)

Scope: applies to everything under `apps/`, unless a deeper `AGENTS.md` in a specific app (e.g. `apps/frontend/AGENTS.md`) adds more detailed rules.

The goal here is to keep all app services **structured, observable, and consistent**.

---

## 1. Common patterns for Node services

Applies to: `backend`, `matchmaking`, `game-server`, `game-gateway`, `allocator`, `scorer`, `chat`.

- Framework:
  - Use **Fastify** with plugins (`@fastify/websocket`, metrics, etc.).
  - New services should follow the established pattern:
    - `Config.ts` for env + defaults.
    - `app/` for domain logic.
    - `infra/` for HTTP/WS servers.
- Logging:
  - Use `@utils/logger` for structured logs.
  - Include relevant identifiers in logs (room IDs, match IDs, user UUIDs, tournament IDs).
  - Do not log sensitive tokens or full JWTs.
- Metrics:
  - Use `@utils/metrics` helpers and expose `/metrics` where appropriate.
  - Label metrics with service name and key dimensions only (avoid high‑cardinality labels).
- Error handling:
  - Prefer returning structured errors (e.g. `code`, `message`) over raw strings.
  - When adding new error scenarios:
    - Define clear error codes (for WS `ERROR` messages) and close codes where relevant.
    - Update `docs/to0nsa/workflow/FailureModesAndUX.md` if user‑visible behavior changes.

---

## 2. Shared TypeScript and build configuration

- All apps are TypeScript‑based; use existing `tsconfig` and path aliases.
- When adding new entrypoints:
  - Keep them under `src/`.
  - Wire them into existing build scripts (`tsc -b` via `.config/tsconfig.build.json`).
- Avoid changing `.config/` unless you understand the impact on the whole monorepo.

---

## 3. Protocols and shared types

- WebSocket and auth protocols are defined in shared packages:
  - Messages: `packages/pong/shared/src/protocol/net.ts`.
  - Tokens: `packages/pong/shared/src/auth/tokenSign.ts` and related helpers.
- When adding or changing message types:
  - Update the shared type definitions first.
  - Adjust both server and client handlers.
  - Update protocol documentation:
    - `docs/to0nsa/workflow/ProtocolReference.md`.
    - Any flow docs that rely on the protocol (e.g. `OnlinePongNetwork.md`, tournament docs).
- Close codes:
  - Use `CLOSE_CODES` from the shared protocol when closing game WS connections.
  - Avoid inventing new raw numeric codes; extend `CLOSE_CODES` if needed.

---

## 4. Service‑specific AGENTS

Some apps have additional rules:

- `apps/frontend/AGENTS.md` – React/Vite frontend conventions.

If you add new `AGENTS.md` under specific apps (e.g. `apps/backend`), keep them aligned with these shared principles and only specialize where necessary (e.g. DB, auth).
