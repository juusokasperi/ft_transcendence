# Scorer Code Review – `apps/scorer`

> Snapshot taken on 2025‑12‑11, based on the current implementation of the scorer.

This document covers observations, risks, and improvement ideas for the scorer service. For a structural overview, see `overview.md`.

---

## 1. Strengths

- **Focused responsibility**
  - The scorer does one thing: compute per-node load scores and write them to Redis.
  - It does not handle allocation, WebSockets, or game logic; those are correctly delegated to other services.

- **Clear metrics model**
  - Uses Prometheus as the primary data source.
  - Falls back to scraping `/metrics` directly when Prometheus is unavailable.
  - Combines CPU, FD usage, and active matches into a single score, which is easy to interpret and tweak.

- **Configuration-driven node discovery**
  - Builds the list of nodes from `GAME_NODES_AMOUNT` and `GAME_SERVER_SERVICE`/ports.
  - Keeps node naming consistent with Docker/compose conventions.

- **Redis schema aligned with allocator**
  - Writes `game-node:scores` entries with `id`, `http`, `ws`, and `score`.
  - This lines up with how the allocator expects to read node information.

---

## 2. Potential issues / things to watch

- **Assumes a fixed number of nodes**
  - Node list is derived from `GAME_NODES_AMOUNT` and a static naming convention:
    - `game-server`, `game-server-2`, `game-server-3`, ...
  - This works for current deployments, but:
    - scaling up/down requires changing env and restarting scorer,
    - dynamic node membership (e.g., in Kubernetes) would need a different discovery mechanism.

- **Scoring weights are hard-coded**
  - The relative importance of CPU, FD usage, and matches is encoded as constants:
    - Prometheus path: `score = cpu * 0.5 + fdLoad * 0.2 + matchesLoad * 0.3`.
    - HTTP fallback path: `score = fdLoad * 0.4 + matchesLoad * 0.6`.
  - These weights might need tuning under different workloads, but they’re not configurable and the difference between primary and fallback is subtle but real.

- **Fallback logic diverges from primary scoring**
  - The fallback path:
    - uses different metric combinations (no CPU),
    - applies different weightings,
    - can assign a large constant score (9999) when metrics can’t be parsed.
  - This can lead to allocator behavior that is noticeably different when Prometheus is down, even if the underlying node load is similar.

- **Limited observability of scorer behavior**
  - While service-level metrics are present (via `registerMetrics`), there are no scorer-specific Prometheus metrics for:
    - how often scores are updated successfully,
    - how often fallback is used,
    - how many nodes are currently in the `game-node:scores` hash.
  - Logs do capture some events (node dropped, fallback warnings), but metrics would make it easier to monitor in dashboards.

- **No test coverage**
  - There are currently no tests under `apps/scorer/tests`.
  - Scoring logic is deterministic and pure enough to be tested:
    - given metric samples, assert the computed score,
    - given partial/missing metrics, assert that nodes are dropped or given high scores,
    - verify fallback behavior when Prometheus throws.

---

## 3. Possible improvements / refactors

- **Make scoring parameters configurable**
  - Extract weights and soft caps into config:
    - `CPU_WEIGHT`, `FD_WEIGHT`, `MATCHES_WEIGHT`.
    - `MATCHES_SOFT_CAP`.
  - Optionally allow different profiles (e.g., more aggressive match balancing vs CPU balancing) via env.
  - This would allow tuning without code changes.

- **Align primary and fallback scoring logic**
  - Today, the fallback path:
    - excludes CPU (because it’s not always exposed),
    - uses different weights.
  - Consider:
    - normalizing both paths to use the same formula when metrics are available, and
    - clearly documenting any unavoidable differences (e.g., CPU not available via HTTP).

- **Add basic unit tests**
  - Extract pure helpers for:
    - computing scores from `{ cpu, fd, maxFds, matches }`,
    - interpreting missing metrics.
  - Write tests that:
    - assert scores for representative inputs,
    - verify behavior when metrics are missing or invalid,
    - verify node removal when metrics are absent.

- **Expose scorer-specific metrics**
  - Add counters/gauges such as:
    - `scorer_updates_total{outcome="ok|fallback|error"}`.
    - `scorer_nodes_tracked` (number of nodes present in `game-node:scores`).
    - `scorer_fallback_active` (simple gauge flag).
  - These would simplify operational debugging and capacity planning.

- **Consider more flexible node discovery (future)**
  - If the deployment model moves beyond a static number of nodes:
    - discover nodes from service discovery (DNS, labels, or a registry),
    - or read the list of nodes from Redis or configuration instead of `GAME_NODES_AMOUNT`.
  - Not needed now, but worth keeping in mind as a future evolution.

Overall, the scorer is well‑scoped and straightforward. The main opportunities are to make scoring **more configurable and observable**, and to add a minimal test layer so that future changes in scoring behavior are safe and intentional.
