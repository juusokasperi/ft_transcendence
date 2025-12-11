# Allocator Code Review – `apps/allocator`

> Snapshot taken on 2025‑12‑11, based on the current implementation of the allocator.

This document focuses on observations, risks, and improvement ideas for the allocator. For an architectural overview, see `overview.md` in the same folder.

---

## 1. Strengths

- **Small, focused service**
  - Only one HTTP endpoint (`POST /allocate`) with a clear responsibility:
    - pick a game node,
    - create a room on that node,
    - return join tokens and an endpoint.
  - No unnecessary layering or abstraction; easy to read end‑to‑end.

- **Explicit use of shared contracts**
  - Uses `JoinTokenClaims` from `@pong/shared/protocol/net` and `signJoinToken` from `@pong/shared/auth/tokenSign`.
  - Respects the same `iss/aud` conventions that the gateway and game server expect (`'mm'` → `'game-node'`).
  - Builds `CreateRoomRequest` payloads that align with `apps/game-server` expectations.

- **Idempotency story is clear**
  - Uses `idempotencyKey` and Redis `allocator:idemp:<key>` entries to:
    - return the same allocation response on retry,
    - log cache hits separately from fresh allocations.
  - This is important for robustness when clients retry after network errors.

- **Simple, transparent node selection**
  - Reads `game-node:scores` from Redis and picks the lowest numeric `score`.
  - The logic is easy to reason about and debug.

---

## 2. Potential issues / things to watch

- **Behaviour when `game-node:scores` is stale or empty**
  - If the hash is empty or contains only invalid entries:
    - allocator returns `503 "No available game nodes"`.
  - This is correct but gives no distinction between:
    - “no nodes registered yet”,
    - “all nodes have unhealthy scores”,
    - or misconfigured scorer not updating the hash.
  - It’s fine for now, but operators will rely heavily on external metrics/logs to diagnose which case they are in.

- **Hard‑coded join deadline and token TTL**
  - `joinDeadlineAtEpochMs` is set to `Date.now() + 15_000` (15 seconds).
  - Join token expiry is fixed at `nowSec + 60` seconds.
  - These may be reasonable defaults, but they are implicit policy:
    - not configurable via env,
    - not obviously aligned with reconnect grace or frontend behavior.
  - If conditions change (longer matchmaking queues, slower clients), these constants might become too strict.

- **Lack of allocator‑specific tests**
  - There are currently no tests under `apps/allocator/tests`.
  - While the code is small, it sits on the critical path:
    - node selection,
    - Redis writes for `room-to-node`,
    - join token minting,
    - idempotency behavior.
  - Bugs here could be hard to detect without automated coverage (e.g., certain modes, tournament payload shapes, or edge cases).

- **Error payloads are fairly generic**
  - Errors return messages like:
    - `"No available game nodes"`,
    - `"Server's are busy."`,
    - `"Internal server error"`.
  - These are adequate for a private API but do not distinguish:
    - node selection failure vs room creation failure vs allocator internal error.
  - This can make client‑side UX and debugging trickier without looking at logs.

---

## 3. Possible improvements / refactors

- **Make timing policies configurable**
  - Promote the following constants into config (or at least named constants in `config.ts`):
    - join deadline offset (currently `+15_000` ms).
    - join token TTL (currently `60` seconds).
  - This would allow tuning based on deployment conditions and aligning them with:
    - reconnect grace windows,
    - frontend join/join‑window expectations.

- **Add basic allocator tests**
  - Even a small test suite would add confidence:
    - Happy path: node scores present, room created, join tokens issued, `room-to-node` set.
    - No nodes: empty `game-node:scores` leading to `503`.
    - Idempotency: second `/allocate` with same `idempotencyKey` returns cached response and does not call `/admin/rooms` again.
    - Tournament mode: ensures tournament context is forwarded correctly to both room creation and join token claims.
  - You can follow patterns from other services (e.g. gateway tests) using Fastify mocks and a fake Redis.

- **Improve observability of node selection**
  - Add logs/metrics that capture:
    - which node was selected (ID, score),
    - when no nodes are available.
  - For metrics:
    - a simple counter like `allocator_allocations_total{outcome="ok|no_nodes|admin_error|internal_error"}` would make it easier to see allocator‑side issues in Prometheus.

- **Clarify error messages for callers**
  - Without changing status codes, you could refine messages slightly:
    - e.g. distinguish between "no nodes available" and "failed to create room on node".
  - If the allocator is only called by trusted backend/matchmaking components, these messages don’t need to be user‑facing; they just need to be clear for services and logs.

Overall, the allocator is small and straightforward. The main opportunities are around **configurability, testing, and observability**, rather than structural changes: making timing parameters explicit, adding a couple of focused tests, and exposing a few allocator‑specific metrics would make it easier to tune and trust in production.
