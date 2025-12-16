# AGENTS – Scorer (`apps/scorer`)

Scope: applies to everything under `apps/scorer/`.

The scorer periodically computes load scores for each game-server node and writes them into Redis. The allocator reads these scores to decide which node should host new rooms. This service influences load balancing, so keep changes small and predictable.

---

## 1. Role and boundaries

- Responsibilities:
  - Discover game-server nodes based on config (`GAME_NODES_AMOUNT`, `GAME_SERVER_SERVICE`, ports).
  - Fetch metrics for those nodes from Prometheus (or via HTTP fallback).
  - Compute a normalized "load score" per node.
  - Write per-node entries to Redis under `game-node:scores`.
- Non‑responsibilities:
  - It does **not** accept allocation requests or mint tokens (allocator’s job).
  - It does **not** manage WebSockets or game logic (game-server/gateway’s job).

---

## 2. Configuration and Redis usage

- Config:
  - Centralize config in `apps/scorer/config.ts`.
  - Required envs:
    - `PROMETHEUS_URL`, `REDIS_URL`.
    - `GAME_NODES_AMOUNT` – number of game-server nodes to score.
    - `GAME_SERVER_PORT`, `GAME_SERVER_HTTP` – WS/HTTP ports for nodes.
    - `SCORER_PORT` – port for the scorer service.
- Redis:
  - Writes to `game-node:scores` (hash):
    - key: node id (e.g. `game-server:55553`, `game-server-2:55553`).
    - value: JSON `{ id, http, ws, score, fallback? }`.
  - Nodes can be removed from scoring by deleting their field from this hash.
- If you modify key shapes or add new hashes/fields:
  - Update `docs/to0nsa/redis/MatchmakingAndAllocator.md` and any related docs.

---

## 3. Metrics sources and scoring

- Primary source:
  - Prometheus HTTP API at `PROMETHEUS_URL`:
    - `process_cpu_seconds_total` (rate) for CPU load.
    - `process_open_fds` and `process_max_fds` for FD load.
    - `game_server_matches` for active matches per node.
- Fallback source:
  - Each game-server node’s `/metrics` endpoint:
    - Same metrics parsed from Prometheus text exposition.
  - Used when Prometheus is unavailable or errors.
- Scoring:
  - Combined score today is:
    - `score = cpuLoad * 0.5 + fdLoad * 0.2 + matchesLoad * 0.3`,
      where:
      - `fdLoad = fd / maxFds`,
      - `matchesLoad = matches / MATCHES_SOFT_CAP`.
  - Keep this logic in `updateScores` (Prometheus) and `updateScoresFromHttpFallback` (HTTP).
  - If you change weights or add new factors, document the new policy in workflow docs.

---

## 4. Service behavior and cadence

- The scorer:
  - Starts a small Fastify app (health + metrics).
  - Logs configured nodes and Prometheus URL at startup.
  - Calls `updateScores()` once on startup.
  - Schedules `updateScores()` every 5 seconds via `setInterval`.
- When changing the cadence:
  - Ensure the new frequency is reasonable for:
    - Prometheus load,
    - Redis write volume,
    - allocator’s expectations.
  - Consider making the interval configurable via env if you need flexibility.

---

## 5. Testing and observability

- There are currently no tests under `apps/scorer/tests`.
  - If you add tests, prefer isolating:
    - score computation from a set of metrics,
    - behavior when Prometheus returns partial or missing data,
    - fallback behavior when Prometheus is unreachable.
- Observability:
  - The scorer itself exposes metrics via `registerMetrics`.
  - You can add scorer‑specific metrics (e.g. counts of updates, fallback usage) if needed.
  - Log enough context when:
    - a node is dropped from scores,
    - fallback is used,
    - errors occur while updating scores.

---

## 6. Documentation expectations

- Scorer behavior is described in:
  - `docs/to0nsa/workflow/AllocatorAndScorer.md`
  - `docs/to0nsa/observability/*` for Prometheus and monitoring setup.
- When modifying how scores are computed or how often, or when adding/removing metrics:
  - Update the above docs so operators and developers understand the new policy.
