# AGENTS – Repository‑Wide Guidelines

Scope: this file applies to the **entire repo**, unless a more specific `AGENTS.md` in a subdirectory adds or tightens rules.

The goal is to keep changes **predictable, small, and well‑aligned** with the existing architecture.

---

## 1. Tooling, runtime, and package manager

- Use **Node.js ≥ `22.19.0`** (see `package.json:engines.node`).
- Use **pnpm** (see `packageManager` field), not npm or yarn:
  - Install deps: `pnpm install`.
  - Run scripts via `pnpm run <script>` or `pnpm <subcommand>` as declared in `package.json`.
- TypeScript:
  - Build all TS projects via `pnpm run build` or `pnpm run build:full`.
  - Type‑check via `pnpm run typecheck`.

---

## 2. Linting, formatting, and dependency hygiene

- Before committing non‑trivial changes, prefer running:
  - Lint: `pnpm run lint`.
  - Typecheck: `pnpm run typecheck`.
  - Format check: `pnpm run check-format`.
- Formatting:
  - Use the repo’s Prettier config: `.config/prettier/prettier.config.cjs`.
  - Use `pnpm run fix-format` instead of hand‑formatting if possible.
- Dependencies:
  - Prefer using **existing packages**; avoid adding new dependencies unless necessary.
  - If you add or upgrade deps:
    - Keep versions consistent across the monorepo.
    - Use `pnpm run check-versions` and `pnpm run fix-versions` to reconcile.
  - Keep import graphs reasonable:
    - `pnpm run check-deps` uses dependency‑cruiser to enforce boundaries; do not introduce new cycles or cross‑layer violations.

---

## 3. Monorepo structure and naming

- Apps live under `apps/`:
  - `frontend` – React/Vite web app.
  - `backend` – REST/HTTP API and auth.
  - `matchmaking`, `game-server`, `game-gateway`, `allocator`, `scorer`, `chat` – realtime/infra services.
- Shared packages live under `packages/`:
  - `@pong/shared`, `@pong/game-logic`, `@utils/*`, etc.
- Documentation lives under `docs/`, with **developer‑facing “courses”** under `docs/to0nsa/*`.

Naming conventions:

- Prefer descriptive names (e.g. `useTournamentConnection`, `MatchRunner`) over single letters.
- For new modules, mirror existing folder layouts (e.g. `domain/`, `app/`, `infra/` in server apps; `hooks/`, `state/`, `components/` in frontend).

---

## 4. Code style and change philosophy

- Follow the **existing patterns** in each area:
  - Node services: Fastify, explicit `Config.ts`, `metrics`, and structured logging (`@utils/logger`).
  - Frontend: React with hooks, context providers, and small presentational components.
  - Docs: short, focused Markdown files, as described in `docs/to0nsa/AGENTS.md`.
- Prefer:
  - Small, cohesive changes over large refactors.
  - Adding new functionality via **new functions/hooks** rather than deeply re‑writing existing ones, unless you fully understand all call sites.
  - Reusing existing abstractions (`useMatchmakingClient`, `ResultReporter`, `ResumeTokenService`, etc.) instead of duplicating behavior.
- When editing performance‑ or correctness‑critical code (matchmaking, game loop, reconnect/tokens):
  - Keep behavior backward compatible unless the intent is a deliberate design change.
  - Favor explicit comments in commit messages or docs rather than inline comments in code.

---

## 5. Testing and validation

- To validate changes, prefer:
  - `pnpm run test` (runs tests where present).
  - Service‑specific tests when available (see individual `AGENTS.md` files under `apps/`).
  - Manual dev flows:
    - `pnpm run dev` (frontend).
    - `pnpm run dev:backend` (backend API).
    - Docker‑based flows as documented under `docs/to0nsa/docker`.
- Do not add new test frameworks; extend existing Vitest tests where appropriate.

---

## 6. Documentation expectations

- When you change **behavior** for online Pong, tournaments, or infra:
  - Update or reference the relevant docs under `docs/to0nsa/`.
  - For new flows, prefer creating a focused doc in a suitable subfolder (e.g. `workflow`, `tournament`, `react`) and link it from the appropriate `overview.md`.
- Keep docs:
  - Concrete (reference real file paths and symbols).
  - Avoiding huge code dumps; prefer short snippets and pointers to files.
- See `docs/to0nsa/AGENTS.md` for documentation‑specific guidelines.

---

## 7. Safety and scope

- Avoid:
  - Changing production Nginx, Docker, or monitoring configs without understanding how they are used in `docs/to0nsa/nginx`, `docs/to0nsa/docker`, and `docs/to0nsa/observability`.
  - Editing SQL schema or migrations unless you also update the database docs under `docs/to0nsa/database`.
- When in doubt:
  - Look for an existing “course” under `docs/to0nsa/…` about the subsystem you’re touching.
  - Align your change with its described design and invariants.
