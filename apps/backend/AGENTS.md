# AGENTS – Backend API (`apps/backend`)

Scope: applies to everything under `apps/backend/`.

The backend is a Fastify API server responsible for:

- Auth (login/signup, JWT cookies, refresh, 2FA).
- User/friends/blocked management.
- Matches, stats, and tournaments (HTTP APIs over the SQLite DB).
- Serving Swagger docs and some static assets (avatars).

These guidelines keep the backend **consistent, safe, and easy to reason about**.

---

## 1. Architecture and layout

- Entrypoint:
  - `index.ts` wires:
    - Config (`utils/config.ts`).
    - Metrics (`metrics/` + `@utils/metrics`).
    - Fastify plugins (`cors`, `cookie`, `multipart`, `static`, Swagger).
    - Database migrations (`db/migrations.ts`).
    - Maintenance jobs (`maintenance/purgeSchedulers.ts`).
    - Routes under `routes/`.
- Directories:
  - `db/` – DB connection and migrations (Umzug + better‑sqlite3).
  - `rest/` / `routes/` – route registration and handlers.
  - `hooks/` – Fastify hooks (auth, validation, etc.).
  - `services/` – reusable business logic (e.g. stats, tournaments).
  - `schemas/` – JSON schemas for validation.
  - `utils/` – helpers (config, error handling, JWT, etc.).
  - `types/` – shared TS types for this app.

When adding new features:

- Keep business logic in `services/` and small route wrappers in `routes/`.
- Reuse existing patterns for hooks and pre‑handlers instead of duplicating auth/validation logic.

---

## 2. Database and migrations

- Database:
  - SQLite accessed via `better-sqlite3`.
  - Schema and tuning documented under `docs/to0nsa/database/*`.
- Migrations:
  - Managed by **Umzug** in `db/migrations.ts`.
  - `runMigrations()` is called on startup from `index.ts`.
- When changing schema:
  - Add a new migration file; do not edit old migrations.
  - Update:
    - Domain docs under `docs/to0nsa/database/`.
    - Any affected services and route handlers.
  - Consider tests under `apps/backend/tests/` for regression coverage.
- Never:
  - Ship code that assumes a new column exists without a migration.
  - Manually mutate schema outside Umzug in app code.

---

## 3. Auth, tokens, and security

- Auth basics:
  - JWTs are issued and verified using helpers in `utils/` (see `config.ts`, `jwt.ts`, token helpers).
  - Access tokens are sent as **httpOnly cookies**; refresh handled via `/api/auth/refresh`.
- When adding or changing auth behavior:
  - Keep access/refresh semantics consistent:
    - Access: short‑lived, used by most routes.
    - Refresh: long‑lived, stored hashed in DB.
  - Use existing `authPreHandler`/hooks to protect new routes rather than custom inline checks.
  - Coordinate with:
    - `docs/to0nsa/workflow/SecurityAndTokens.md`.
    - `docs/to0nsa/workflow/BackendAndAPIs.md`.
    - Any services (matchmaking, chat) that rely on backend tokens.
- 2FA / email flows:
  - Reuse existing patterns for pending users, password resets, and delete requests.
  - Ensure tokens have explicit expirations and are stored safely.

---

## 4. Routes, schemas, and error handling

- Routes:
  - Define new route modules under `routes/` and register them in `index.ts` with a clear prefix (`/api/...`).
  - Keep handlers small; delegate to `services/` when logic grows.
- Validation:
  - Use JSON schemas under `schemas/` and Fastify’s built‑in validation (AJV).
  - Prefer strict schemas (avoid `additionalProperties: true` unless needed).
- Errors:
  - Use the shared error handler (`utils/errorHandler.ts`) by throwing/returning consistent errors.
  - For client‑visible errors:
    - Return structured payloads with `code` and `message`.
    - Keep codes stable so frontend error handling and docs remain accurate.
  - When adding new error codes:
    - Update docs where they’re surfaced (e.g. `DataFetchingAndErrors.md`, workflow/tournament docs if relevant).

---

## 5. Metrics, health, and observability

- Metrics:
  - Use `registerMetrics` from `@utils/metrics` (already called in `index.ts`).
  - When adding new metrics:
    - Use clear, low‑cardinality labels.
    - Document any new important series in `docs/to0nsa/observability`.
- Health:
  - `/health` should stay fast and side‑effect‑free; do not add heavyweight checks.
- Logging:
  - Use `createFastifyLoggerConfig({ service: 'api' })`.
  - Log relevant identifiers (user UUIDs, tournament IDs, match IDs) but never raw passwords or full JWTs.

---

## 6. Testing and dev workflows

- Dev:
  - Use `pnpm -F @app/api dev` or the local `package.json` scripts (`npm`/`pnpm`) as documented in `README.md`.
  - Keep Swagger docs working at `/docs` so routes remain discoverable.
- Tests:
  - Use existing Vitest config (`vitest.config.ts`).
  - Add tests under `tests/` for new routes and services where reasonable.
- When adding new routes or changing existing ones:
  - Verify happy‑path and common error responses manually (using curl or a REST client).
  - Update docs in `docs/to0nsa/workflow/BackendAndAPIs.md` and `docs/to0nsa/database/*` as needed.
