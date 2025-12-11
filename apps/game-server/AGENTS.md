# AGENTS – Game Server (`apps/game-server`)

Scope: applies to everything under `apps/game-server/`.

The game server is the authoritative Pong simulation node. It runs the match loop, manages rooms and sessions, handles join/resume tokens and reconnects, and reports results to the backend. These guidelines keep this service safe, predictable, and aligned with the rest of the monorepo.

---

## 1. Architecture and layering

- Respect the existing three‑layer structure:
  - `domain/` – pure domain logic and types:
    - `MatchTypes`, `RoomReservation`, `MatchModel`, `TickEngine`, `PauseQuantizer`, `Policies`.
    - No I/O, logging, or external APIs.
  - `app/` – application services:
    - `RoomRegistry`, `MatchRunner`, `ReconnectManager`, `ResumeTokenService`, `ResultReporter`, `AuthService`, `GameServer`.
    - Orchestrates domain types and infra, but does not know about Fastify internals.
  - `infra/` – transport and servers:
    - HTTP (`infra/http`) and WebSocket (`infra/ws/WSServer`) wiring.
    - Responsible for Fastify setup and routing only.
- When adding new behavior:
  - Prefer adding to `domain/` if it is pure logic.
  - Put orchestration and policies in `app/`.
  - Keep HTTP/WS concerns in `infra/` and avoid leaking Fastify or WS types into `domain/`.

---

## 2. Configuration, time, and Redis

- `Config.ts`:
  - Extend `AppConfig` instead of sprinkling new `process.env` reads.
  - Keep defaults reasonable; fail fast on invalid numeric envs.
  - If you add config that affects reconnect/timing, update the relevant docs under:
    - `docs/to0nsa/workflow/OnlinePongNetwork.md`
    - `docs/to0nsa/workflow/OnlinePongDataPlane.md`
- `Time.ts`:
  - Use the `Clock`/`Scheduler` abstractions in new services; do not call `setTimeout` / `setInterval` directly in core logic.
  - This keeps tests deterministic and avoids leaking Node timer types into domain code.
- `RedisFactory.ts`:
  - Use the shared Redis instance created in `GameServer`; do not construct ad‑hoc clients in random files.
  - If you add new Redis keys or patterns, document them in:
    - `docs/to0nsa/redis/*`
    - and reference them from any workflow docs that rely on them.

---

## 3. Protocols, tokens, and reconnects

- Protocol definitions live in shared packages:
  - Messages: `packages/pong/shared/src/protocol/net.ts`.
  - Tokens: `packages/pong/shared/src/auth/tokenSign.ts`.
- When adding or changing message types or token claims:
  - Update the shared types first.
  - Review and update all relevant handlers:
    - `WSServer` (server → client and client → server).
    - Frontend `connect-online.ts` and related hooks.
    - Gateway (`apps/game-gateway`) if subprotocols or token flows change.
  - Update protocol docs:
    - `docs/to0nsa/workflow/ProtocolReference.md`
    - and any affected flow docs (e.g. `OnlinePongNetwork.md`, tournament docs).
- Join/resume tokens:
  - Preserve the current security model:
    - Join token single‑use is enforced via Redis `join-token:<jti>` keys written by the gateway.
    - Resume tokens are single‑use and bounded TTL via `ResumeTokenService` and Redis `resume-token:<jti>`.
  - Do not bypass these checks or introduce alternate admission paths without updating:
    - `docs/to0nsa/workflow/SecurityAndTokens.md`
    - `docs/to0nsa/redis/GameServerAndGateway.md`.
- Reconnect logic:
  - Keep `ReconnectManager` the central place for grace windows and timeout forfeits.
  - If you add new states or reasons (e.g. new timeout conditions), update:
    - `docs/to0nsa/workflow/OnlinePongReconnect.md` (if present),
    - `FailureModesAndUX.md` for user‑visible behavior.

---

## 4. Match loop, sessions, and forfeit behavior

- Match loop:
  - `MatchRunner` and `TickEngine` form the critical path:
    - Avoid adding heavy work (e.g. extra logging, network calls, large allocations) to `tick()` or `stepOnce`.
    - If you need new per‑tick behavior, consider whether it belongs in `@pong/game-logic` instead.
- Sessions and registry:
  - Use `RoomRegistry` as the single source of truth for reservations and live `MatchSession`s.
  - Do not hand‑roll your own maps of rooms → sockets elsewhere; hang any additional per‑session state off of `MatchSession` if necessary.
- Forfeits and match end:
  - Today, forfeits can originate from explicit `forfeit` messages, reconnect grace expiry, or double‑quit.
  - If you modify match‑end behavior:
    - Keep `ResultReporter` the canonical place for reporting to the backend.
    - Ensure `MATCH_END` notifications stay consistent with docs and frontend expectations.
    - Consider centralizing match‑end orchestration instead of duplicating result/cleanup logic in multiple places.

---

## 5. Testing and validation

- Tests live under `apps/game-server/tests` and use Vitest.
  - Keep new tests close to the code they exercise (e.g. WS behavior in `tests/wss.*.test.ts`).
  - Follow existing patterns for mocking Fastify, Redis, and WebSockets.
- When changing behavior in:
  - Reconnect/resume flows,
  - Match reporting,
  - Token handling,
  - or `WSServer` message handling,
  add or adjust tests to cover both happy path and failure modes.
- For local dev:
  - Run `pnpm -F @app/game-server test` for this service.
  - Use `docker-compose.yml` to spin up the full stack and verify WS flows from the frontend.

---

## 6. Documentation expectations

- This service is already heavily documented in `docs/to0nsa`:
  - `workflow/OnlinePongNetwork.md`, `OnlinePongDataPlane.md`, `GameNode.md`, `FailureModesAndUX.md`.
  - `redis/GameServerAndGateway.md` for Redis keys and token flows.
  - `tournament/*` for tournament‑specific flows.
- When you change:
  - Message shapes or close codes → update `ProtocolReference.md`.
  - Reconnect/forfeit behavior → update `FailureModesAndUX.md` and any reconnect‑focused docs.
  - Tournament behavior → update the relevant `docs/to0nsa/tournament/*.md`.
- Keep code comments focused and precise; use docs for broader explanations and flow diagrams.
