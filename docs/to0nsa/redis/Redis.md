# Redis in ft_transcendence – Overview and Mental Model

This document is a **high‑level course on Redis** in the ft_transcendence project:

- What Redis is and why it fits this stack.
- Which services use it and for what kinds of data.
- How Redis keys and TTLs are used to keep the online Pong system safe and fast.

For concrete, service‑specific flows, see:

- `MatchmakingAndAllocator.md` – queues, room placement, tokens.
- `GameServerAndGateway.md` – join/resume tokens and reconnect logic.
- `TournamentsAndBackend.md` – tournament coordination.

---

## 1. What Redis is (for this project)

Redis is an **in‑memory data store** that is:

- Very fast (single‑threaded, in RAM).
- Key/value oriented with rich data structures (strings, hashes, lists, sets, streams).
- Able to **expire keys automatically** (TTL).
- Often used as:
  - A cache.
  - A short‑lived coordination store.
  - A message bus (pub/sub, streams).

In ft_transcendence, Redis is used as a **shared, ephemeral control‑plane database**:

- No user data is permanently stored in Redis.
- It coordinates **online Pong services** that need fast, low‑latency communication:
  - Matchmaking.
  - Allocator.
  - Game gateway.
  - Game servers.
  - Scorer.
  - Backend tournament scheduler.

Persistent data (users, matches, rankings, tournaments) lives in the backend’s SQLite database; Redis is for **live state and tokens** that don’t belong in the main DB.

---

## 2. Where Redis fits in the architecture

At a high level:

- **Matchmaking** uses Redis to:
  - Communicate with game servers and allocator via pub/sub and streams.
  - Track short‑lived rate‑limit buckets per user.

- **Allocator** uses Redis to:
  - Cache allocation results (idempotency).
  - Map room IDs to game nodes.

- **Game gateway** uses Redis to:
  - Look up which game node hosts a given room (`room-to-node:*`).
  - Enforce **single‑use join tokens**.

- **Game server** uses Redis to:
  - Store and consume **resume tokens**.
  - Implement **per‑player input rate limiting**.
  - Publish `room_ready` events when a room is ready to start.

- **Scorer** uses Redis to:
  - Store per‑node **health/load scores** that allocator reads.

- **Backend** uses Redis to:
  - Publish tournament events to Redis streams for matchmaking to consume.

Redis is therefore the **real‑time glue** that connects independent services without adding heavy coupling or writing extra tables to the main DB.

---

## 3. Types of data stored in Redis

Across the app, Redis is used for a few recurring patterns:

1. **Token registries with TTLs**
   - Join tokens (`join-token:*`) – mark tokens as “used once”.
   - Resume tokens (`resume-token:*`) – mark resume tokens as consumed and enforce single use.

2. **Room routing and placement**
   - Room → node mapping (`room-to-node:*`) – tells the gateway which game node to proxy to.
   - Game node scores (`game-node:scores`) – allocator reads which node is least loaded.

3. **Rate limiting**
   - Per‑user token buckets via a `RedisTokenBucket` helper (`mm:rl`, `gs:rl` prefixes).

4. **Pub/sub and streams for async events**
   - Pub/sub channels:
     - `room_ready` – game servers notify matchmaking when a room is ready to accept players.
   - Streams:
     - Tournament matches ready (`STREAM_TOURNAMENT_MATCHES_READY`).
     - Tournament state updates (`STREAM_TOURNAMENT_STATE_UPDATED`).

Each of these is described in more detail in the service‑specific docs.

---

## 4. Dev and production configuration

Environment variables:

- `REDIS_URL` – connection string (`redis://redis:6379` in Docker, `redis://localhost:6379` in local backend tests).
- Individual services may also expose:
  - `REDIS_PORT` (for matchmaking/game‑gateway in Docker).

Compose files:

- `docker-compose.yml` and `docker-compose-prod.yml` define a shared `redis` service:
  - All real‑time services connect to it using the same `REDIS_URL`.

Implementation:

- Node services use `ioredis`:

  ```ts
  import Redis from 'ioredis';
  const redis = new Redis(REDIS_URL);
  ```

  or a small factory (`createRedisFactory`) in the game server.

---

## 5. Why Redis (and not just the DB or in‑memory maps)

Redis is chosen for this project because it gives:

- **Low latency and high throughput** for tokens, room lookups, and rate limiting.
- **Shared, cross‑service state**:
  - Matchmaking, allocator, gateway, and game nodes can all see the same keys.
  - No single process has to own all this state in memory.
- **Automatic cleanup via TTL**:
  - Join/resume tokens expire.
  - Room mappings are removed after a short period.
  - Tournament stream entries are capped with `MAXLEN`.
- **Simple pub/sub and streams**:
  - Game nodes can publish `room_ready` without knowing who is listening.
  - Backend tournament code can publish ready matches; matchmaking consumes them asynchronously.

Using the backend SQL DB for these concerns would:

- Increase database load with very short‑lived rows.
- Make cross‑service coordination more heavyweight and slower.

Using in‑memory maps in each service would:

- Break cross‑service coordination (each process would have its own view of the world).
- Lose state on process restart.

Redis is the **right middle ground** for fast, ephemeral coordination in an online game like this.

---

## 6. Next steps

To dive deeper, read:

- `MatchmakingAndAllocator.md` – Redis in matchmaking/allocator/scorer flows.
- `GameServerAndGateway.md` – Redis for join/resume tokens, room routing, and rate limiting.
- `TournamentsAndBackend.md` – Redis streams and tournament coordination.

These docs show concrete key names, TTLs, and how each part of the stack uses Redis day‑to‑day.

