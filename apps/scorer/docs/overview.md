# Scorer – Overview (`apps/scorer`)

> Snapshot taken on 2025‑12‑11, based on the current implementation of the scorer.

The scorer is a background service that periodically computes load scores for each game-server node and writes them into Redis. The allocator reads these scores to choose which node should host a new room.

---

## 1. High‑Level Role & Runtime

- Responsibilities:
  - Discover game-server nodes (e.g. `game-server`, `game-server-2`, ...) from config.
  - Fetch metrics for those nodes from Prometheus (primary path).
  - If Prometheus fails, fall back to scraping each node’s `/metrics` endpoint directly.
  - Compute a normalized "load score" per node.
  - Store scores (and node endpoints) in Redis under `game-node:scores`.

- Entry:
  - `apps/scorer/index.ts`:
    - Creates a Fastify app with a logger and metrics.
    - Defines `GET /health`.
    - On startup:
      - Listens on `SCORER_PORT`.
      - Logs configured nodes and Prometheus URL.
      - Calls `updateScores()` once.
      - Schedules `updateScores()` every 5 seconds.

---

## 2. Configuration (`config.ts`)

File: `apps/scorer/config.ts`

- Loads `.env` and requires:
  - `PROMETHEUS_URL` – base URL of Prometheus HTTP API.
  - `REDIS_URL` – Redis connection.
  - `GAME_NODES_AMOUNT` – number of nodes to track.
  - `GAME_SERVER_PORT` – WS port for game-server nodes.
  - `GAME_SERVER_HTTP` – HTTP port for game-server nodes (for `/metrics`).
  - `SCORER_PORT` – port where scorer listens.
- Exports:
  - `REDIS_URL`, `PROMETHEUS_URL`.
  - `GAME_SERVER_SERVICE` – base hostname prefix (`game-server`).
  - `GAME_SERVER_PORT`, `GAME_SERVER_HTTP`.
  - `GAME_NODES_AMOUNT`, `SCORER_PORT`.

These are consumed in `index.ts` when building the node list and binding the HTTP server.

---

## 3. Node Discovery

File: `apps/scorer/index.ts`

- Nodes are constructed as:

  ```ts
  const nodes = Array.from({ length: GAME_NODES_AMOUNT }, (_, i) => {
    let host = GAME_SERVER_SERVICE; // "game-server"
    if (i > 0) host += `-${i + 1}`; // "game-server-2", "game-server-3", ...
    return {
      id: `${host}:${GAME_SERVER_PORT}`,
      http: `http://${host}:${GAME_SERVER_HTTP}`,
      ws: `ws://${host}:${GAME_SERVER_PORT}`,
    };
  });
  ```

- This list determines:
  - Which instances the scorer expects Prometheus metrics for.
  - Which hosts to contact directly in the HTTP fallback.

---

## 4. Primary Path: Prometheus (`getMetricsFromPrometheus`, `updateScores`)

### 4.1 Fetching metrics

- `getMetricsFromPrometheus()`:
  - Queries Prometheus for four metrics:
    - `cpuQuery` – `rate(process_cpu_seconds_total{instance=~"game-server.*"}[1m])`.
    - `fdQuery` – `process_open_fds{instance=~"game-server.*"}`.
    - `maxFdQuery` – `process_max_fds{instance=~"game-server.*"}`.
    - `matchesQuery` – `game_server_matches`.
  - Performs all queries in parallel with `Promise.all`.
  - Builds a `Map<string, { cpu, fd, maxFds, matches }>` keyed by node id.
  - Initializes each node with default metrics (`cpu = 0`, `fd = 0`, `maxFds = 1024`, `matches = 0`) and fills in values where present.

### 4.2 Computing scores

- `updateScores()`:
  - Calls `getMetricsFromPrometheus()`.
  - For each node:
    - If metrics missing:
      - Logs a warning and removes the node’s entry from `game-node:scores`.
    - Else:
      - Computes:
        - `cpuLoad = metrics.cpu`.
        - `fdLoad = metrics.fd / (metrics.maxFds || 1)`.
        - `matchesLoad = metrics.matches / MATCHES_SOFT_CAP` (soft cap constant = 200).
      - Combines into a score:
        - `score = cpuLoad * 0.5 + fdLoad * 0.2 + matchesLoad * 0.3`.
      - Writes into Redis:
        - key: `game-node:scores`.
        - field: `node.id`.
        - value: JSON `{ id, http, ws, score }` with score rounded to 4 decimals.
  - On any error (e.g., Prometheus unavailable):
    - Calls `updateScoresFromHttpFallback()` instead.

---

## 5. Fallback Path: HTTP Scraping (`updateScoresFromHttpFallback`)

When Prometheus cannot be reached or fails, the scorer falls back to querying each node directly:

- `updateScoresFromHttpFallback()`:
  - For each node:
    - Sends `GET ${node.http}/metrics` with a 2s timeout.
    - Uses `parsePrometheusText` to parse:
      - `process_open_fds`.
      - `process_max_fds` (defaults to 1024 if missing).
      - `game_server_matches`.
    - If `fd` and `matches` are present:
      - Computes:
        - `fdLoad = fd / maxFds`.
        - `matchesLoad = matches / MATCHES_SOFT_CAP`.
        - `score = fdLoad * 0.4 + matchesLoad * 0.6` (slightly different weights).
      - Writes to `game-node:scores` with `fallback: true` in the JSON.
    - If metrics cannot be parsed:
      - Logs a warning.
      - Assigns a high score (9999) to effectively deprioritize the node.
  - On HTTP request failure for a node:
    - Logs an error.
    - Removes that node from `game-node:scores` (`HDEL`).

This ensures allocator still has some notion of node load even if Prometheus is down, at the cost of slightly different scoring semantics.

---

## 6. Health and Metrics

- `GET /health`:
  - Returns `{ status: 'ok' }`.
  - Used for liveness checks.

- Metrics:
  - `registerMetrics(app, { labels: { service: 'scorer' } })`:
    - Exposes Prometheus service metrics at `/metrics`.
    - Includes default labels (`service="scorer"`, plus env/version).
  - Additional scorer‑specific metrics (e.g. counts of updates, fallback usage) can be added if needed via `prom-client`.

---

## 7. Interaction with Other Services

- **Allocator (`apps/allocator`)**:
  - Reads `game-node:scores` to choose the "best" node:
    - Typically picks the node with the lowest score whose JSON includes `id`, `http`, `ws`.

- **Game-server (`apps/game-server`)**:
  - Each instance:
    - Exposes `/metrics` for Prometheus and HTTP fallback.
    - Provides `game_server_matches` and process metrics used in scoring.

- **Prometheus**:
  - Primary source of metrics for scoring:
    - Must be configured to scrape game-server metrics endpoints.
  - If Prometheus is not available, scorer falls back to scraping game-server directly.

For more details on how scoring feeds into allocation, see:

- `docs/to0nsa/workflow/AllocatorAndScorer.md`
- `docs/to0nsa/observability/PrometheusAndAlertmanager.md`
