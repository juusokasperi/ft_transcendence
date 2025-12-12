# AGENTS – Matchmaking (`apps/matchmaking`)

Scope: applies to everything under `apps/matchmaking/`.

The matchmaking service is the browser‑facing control plane for online Pong. It authenticates clients, runs ranked queue pairing, coordinates invite‑only matches, orchestrates tournament participation and scheduled matches, and hands players off to game nodes via the allocator. Backend remains the source of truth for persistence; matchmaking manages live, in‑memory coordination.

---

## 1. Architecture and boundaries

- Keep the current “thin entrypoint, fat helpers” shape:
  - `index.ts`:
    - Fastify + WebSocket wiring.
    - Message dispatch and state‑machine gating.
    - Redis client creation and bridge initialization.
    - Avoid adding new business logic here; push it into `utils/`.
  - `auth/`:
    - Site token verification and MMR fetch (`auth/auth.ts`).
    - Treat changes here as auth‑sensitive; never log raw tokens.
  - `types/`:
    - `ClientInfo`, `ClientState`, and other shared matchmaking types.
    - Any new client‑visible state should be reflected here first.
  - `utils/`:
    - Ranked pairing + accept/decline + allocator handoff (`queue.ts`).
    - Invite lobbies (`invites.ts`).
    - Tournament orchestration (`scheduledMatches.ts`).
    - Redis pub/sub + streams bridge (`MatchmakingRedisBridge.ts`).
    - Pending handoff timers / rollback (`pendingHandoffs.ts`).
    - Rate limiting (`ratelimit.ts`).
    - State transitions (`state.ts`).

- When adding features:
  - Put **ranked queue** changes in the ranked module; avoid tournament branching there.
  - Put **tournament rules/scheduling** changes in the tournament module; avoid coupling to MMR buckets.
  - Put **invite‑only rules** in `invites.ts`.
  - Keep shared concerns (allocator handoff, timeouts, message shaping) factored as small helpers rather than copied across modules.

---

## 2. Client state machine

- `ClientState` is the server‑side truth for what messages are legal.
  - Keep the gating in the WS switch in `index.ts` aligned with the enum.
  - If you add a new state, also add:
    - a `StateTransitionReason` in `utils/state.ts`,
    - and update any docs/tests that describe state flows.

- Use `setClientState(...)` for **all** transitions.
  - Do not mutate `client.state` directly elsewhere.
  - Transitions should be accompanied by the WS message that drives the UI.

---

## 3. Redis and inter‑service communication

- Redis clients are created once in `index.ts` and passed/closed centrally.
  - Do not instantiate ad‑hoc Redis clients in helpers.

- Current Redis usage:
  - Pub/sub:
    - `room_ready` (published by game servers; consumed here to clear pending handoffs).
  - Streams:
    - `STREAM_TOURNAMENT_MATCHES_READY`
    - `STREAM_TOURNAMENT_STATE_UPDATED`
    - Consumed via `MatchmakingRedisBridge`.
  - Rate limiting:
    - `RedisTokenBucket(redis, 'mm:rl')` per connected client.

- If you add new keys/channels/streams:
  - Keep names/prefixes consistent with existing patterns.
  - Update Redis docs under `docs/to0nsa/redis/*` and reference the new behavior in workflow docs.

---

## 4. Allocation & handoff

- `createMatch(...)` is the only path that talks to the allocator.
  - It must remain idempotent via a fresh `matchId` used as allocator `idempotencyKey`.
  - It is shared by ranked, invite, and tournament flows; avoid duplicating allocator calls elsewhere.

- If you add a new match mode:
  - Extend `MatchMode` in `types/types.ts`.
  - Update allocator schema (`apps/allocator/utils/schema.ts`) and any shared protocol types as needed.
  - Ensure game‑server / gateway token expectations (`iss/aud`, claims) remain aligned.

---

## 5. Tournament vs ranked separation

- Treat ranked and tournament as separate subsystems that share only:
  - authentication,
  - WS transport,
  - allocator handoff.

- If the code starts to feel mixed:
  - Prefer **Option A** from `docs/review.md`: extract a shared handoff helper and rename modules so ownership is explicit.
  - Do not re‑introduce tournament branching into ranked pairing, or vice‑versa.

---

## 6. Performance, logging, and metrics

- Hot paths:
  - `tryMatchQueue(...)` runs every 500ms.
  - Tournament countdown intervals can tick every second.
  - Keep these loops allocation‑light and avoid heavy logging.

- Logging:
  - Use `@utils/logger`.
  - Include identifiers (client UUID, matchId, tournamentId) but **never** log raw JWTs or join/resume tokens.
  - Prefer `debug` for per‑tick/per‑message traces; keep `info`/`warn`/`error` meaningful.

- Metrics:
  - Use `registerMetrics` and keep labels low‑cardinality.
  - If adding service‑specific counters, follow patterns used in other services.

---

## 7. Testing and documentation

- Tests live under `apps/matchmaking/tests` and use Vitest.
  - Add tests for new ranked/invite/tournament behaviors in this folder.
  - Mock axios/Redis/WS following existing tournament test patterns.
  - Run: `pnpm -F @app/matchmaking test`.

- Protocol and UX docs:
  - WS messages and token shapes are shared contracts in `@pong/shared`.
  - When changing message types, close codes, or token claims:
    - Update `packages/pong/shared/src/protocol/net.ts` and/or `packages/pong/shared/src/auth/*` first.
    - Update affected services (gateway, game‑server, frontend handlers).
    - Update docs:
      - `docs/to0nsa/workflow/MatchmakingService.md`
      - `docs/to0nsa/workflow/ProtocolReference.md`
      - `docs/to0nsa/workflow/FailureModesAndUX.md`
      - tournament docs under `docs/to0nsa/tournament/*`.
