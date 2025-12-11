# AGENTS – Allocator (`apps/allocator`)

Scope: applies to everything under `apps/allocator/`.

The allocator is a small HTTP service that picks a game node for a match, creates a room on that node, and issues per‑player join tokens. It is on the critical path for starting online matches, so changes should be minimal, predictable, and well‑documented.

---

## 1. Role and boundaries

- Responsibilities:
  - Accept `/allocate` requests from matchmaking/backend.
  - Select an appropriate game node based on scores in Redis (`game-node:scores`).
  - Call the target node’s `/admin/rooms` HTTP API to register a room.
  - Store `room-to-node:<roomIdentifier>` in Redis so the game gateway can route WS connections.
  - Mint per‑player join tokens (`signJoinToken`) and return them to the caller.
  - Provide idempotency via `idempotencyKey` and a cached response in Redis.
- Non‑responsibilities:
  - It does **not** run the game simulation, handle WebSockets, or manage reconnects; those live in `apps/game-server` and `apps/game-gateway`.
  - It does **not** make matchmaking decisions; it assumes the caller has chosen players/mode.

---

## 2. Configuration and Redis usage

- All config should flow through `utils/config.ts`:
  - Required envs:
    - `ALLOCATOR_PORT` – HTTP port for `/allocate`.
    - `ADMIN_SECRET` – shared secret to call game-node `/admin/rooms`.
    - `REDIS_URL` – Redis connection string.
  - Exported values:
    - `PORT`, `REDIS_URL`, `IDEMPOTENCY_PREFIX`, `ADMIN_SECRET`.
- Redis keys:
  - `game-node:scores` – hash of node information and load score (read‑only here).
  - `room-to-node:<roomIdentifier>` – mapping used by the gateway to route `/g/:roomId`.
  - `${IDEMPOTENCY_PREFIX}${idempotencyKey}` – cached allocation response.
- If you introduce new keys or semantics:
  - Update `docs/to0nsa/redis/MatchmakingAndAllocator.md` and any relevant workflow docs.

---

## 3. Tokens and security

- Join tokens:
  - Use `signJoinToken` from `@pong/shared/auth/tokenSign`.
  - Claims:
    - `iss: 'mm'` and `aud: 'game-node'` (allocator → game-node).
    - `roomIdentifier`, `sub` (playerIdentifier), `side`, `simulationStartTick`.
    - Optional tournament context (`tournamentId`, `tournamentMatchId`, `tournamentStage`, participants).
  - Keep token shape aligned with `JoinTokenClaims` in `@pong/shared/protocol/net`.
- Do **not**:
  - Add new token types or ad‑hoc secrets here; reuse shared auth helpers.
  - Change `iss`/`aud` without updating:
    - game gateway validation,
    - game-server `AuthService`,
    - and token docs under `docs/to0nsa/workflow/SecurityAndTokens.md`.

---

## 4. Allocation flow and error handling

- Keep `/allocate` simple and side‑effect order clear:
  1. Validate request body via `AllocateSchema`.
  2. Check idempotency cache; if present, return cached response.
  3. Pick best node based on `game-node:scores` (lowest score wins).
  4. Compute `roomIdentifier` and `joinDeadlineAtEpochMs`.
  5. Write `room-to-node:<roomIdentifier>` so the gateway can route.
  6. Call node’s `/admin/rooms` with `ADMIN_SECRET`.
  7. On success, mint join tokens and cache the response.
  8. Return join tokens + endpoint to caller.
- On errors:
  - Use 503 for “no available nodes” or when node allocation fails.
  - Use 500 for unexpected allocator errors.
  - Log enough context (idempotencyKey, roomIdentifier, node target) without logging full tokens.

---

## 5. Testing and changes

- There are currently no tests under `apps/allocator/tests`.
  - If you add tests, use Vitest and follow patterns from other services (e.g. gateway, game-server).
  - Prefer testing the `/allocate` handler via Fastify’s inject API or by isolating the “pick node + build allocation response” logic into a helper.
- When you:
  - Change how nodes are selected or scored,
  - Modify token claims or expiry,
  - Adjust idempotency behavior,
    update:
  - `docs/to0nsa/workflow/AllocatorAndScorer.md`,
  - and any relevant tournament/online workflow docs.

---

## 6. Documentation expectations

- Allocator behavior is described primarily in:
  - `docs/to0nsa/workflow/AllocatorAndScorer.md`
  - `docs/to0nsa/redis/MatchmakingAndAllocator.md`
- When making non‑trivial changes, keep:
  - Code comments precise and low‑level (what/why in this file).
  - Workflow docs updated with the high‑level flow and invariants.
