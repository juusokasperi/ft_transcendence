# Redis in Matchmaking, Allocator, and Scorer

This document explains how **Redis is used by the control‑plane services** that decide who plays where:

- Matchmaking (`apps/matchmaking`)
- Allocator (`apps/allocator`)
- Scorer (`apps/scorer`)
- Backend tournament bridge (`apps/backend/services/matchmakingBridge.ts`)

Read this together with:

- `docs/to0nsa/workflow/MatchmakingService.md`
- `docs/to0nsa/workflow/AllocatorAndScorer.md`

---

## 1. Matchmaking service (`apps/matchmaking`)

**Files:**

- `apps/matchmaking/index.ts`
- `apps/matchmaking/utils/MatchmakingRedisBridge.ts`
- `packages/utils/rate-limiter/src/index.ts`

### 1.1 Connections and rate limiting

In `index.ts`:

```ts
const redis = new Redis(REDIS_URL);
const redisStream = redis.duplicate();
const redisPubSub = redis.duplicate();
const redisBridge = new MatchmakingRedisBridge(/* ... */, redisPubSub, redisStream);
await redisBridge.init();
const rateLimiter = new RedisTokenBucket(redis, 'mm:rl');
```

Matchmaking uses:

- A **main Redis connection** for rate limiting and general commands.
- A **stream connection** (`redisStream`) for tournament streams.
- A **pub/sub connection** (`redisPubSub`) for `room_ready` notifications.

The `RedisTokenBucket` (`@utils/rate-limiter`) implements per‑user rate limiting:

- Keys look like `mm:rl:<playerId>` or similar.
- It stores token counts and timestamps in Redis so rate limiting works across all matchmaking instances.

### 1.2 Room ready notifications (pub/sub)

`MatchmakingRedisBridge` subscribes to the `room_ready` channel:

```ts
await this.subscriber.subscribe('room_ready');
this.subscriber.on('message', (channel, message) => {
  if (channel !== 'room_ready') return;
  const { roomIdentifier } = JSON.parse(message);
  this.handlers.onRoomReady(roomIdentifier);
});
```

Game servers publish to `room_ready` when a room has both players attached and the match is ready to start.  
Matchmaking then:

- Marks the pending match as ready.
- Sends `HANDOFF` or related messages to clients.

### 1.3 Tournament coordination via Redis Streams

`MatchmakingRedisBridge` also reads from Redis streams:

- `STREAM_TOURNAMENT_MATCHES_READY`
- `STREAM_TOURNAMENT_STATE_UPDATED`

Using `XREADGROUP`:

```ts
await this.stream.xgroup('CREATE', streamKey, STREAM_GROUP, '0', 'MKSTREAM');
// ...
const responseRaw = await this.stream.call('XREADGROUP', ...args);
```

This lets the backend **push tournament events into Redis**, and matchmaking consume them asynchronously:

- **Matches ready** – triggers match scheduling for tournament matches.
- **State updated** – triggers lobby/participant updates.

---

## 2. Allocator (`apps/allocator`)

**File:** `apps/allocator/index.ts`

Allocator uses Redis for:

1. **Idempotency cache.**
2. **Room → node mapping.**

### 2.1 Idempotency cache

Keys: `IDEMPOTENCY_PREFIX + idempotencyKey`

Usage:

```ts
const cached = await redis.get(IDEMPOTENCY_PREFIX + idempotencyKey);
if (cached) {
  return reply.send(JSON.parse(cached));
}
```

After successful allocation:

```ts
await redis.set(IDEMPOTENCY_PREFIX + idempotencyKey, JSON.stringify(response), 'EX', 300);
```

Why:

- If matchmaking retries `/allocate` with the same `idempotencyKey` (e.g. network hiccup), Allocator returns the same room and tokens instead of creating duplicates.

### 2.2 Room → node mapping

When a room is allocated:

```ts
await redis.set(`room-to-node:${roomIdentifier}`, wsNodeUrl, 'EX', 900);
```

Where:

- `roomIdentifier` – room ID (e.g., `r-uuid`).
- `wsNodeUrl` – WebSocket URL of the chosen game server node.
- TTL: 900 seconds (15 minutes).

The **game gateway** uses this mapping to route `/g/:roomId` WebSocket connections to the correct node.

---

## 3. Scorer (`apps/scorer`)

**File:** `apps/scorer/index.ts`

Scorer computes **health/load scores** for each game server node based on metrics and writes them into Redis:

Key: `game-node:scores` (a Redis **hash**)

Values:

- Field: node ID (e.g., `game-server:55553`).
- Value: JSON blob:

```json
{
  "id": "game-server:55553",
  "http": "http://game-server:55554",
  "ws": "ws://game-server:55553",
  "score": 0.42
}
```

The score combines:

- CPU usage.
- Open file descriptors vs max.
- Number of matches (relative to a soft cap).

Allocator reads this hash and picks the node with the **lowest score** when placing new rooms.

If Scorer falls back to HTTP metrics (instead of Prometheus), it still writes compatible entries with a `fallback: true` flag.

---

## 4. Backend tournament bridge (`apps/backend/services/matchmakingBridge.ts`)

The backend uses Redis to **notify matchmaking about tournament events**:

```ts
const redis = new Redis(REDIS_URL);

async function appendToStream(payload, streamKey) {
  await redis.xadd(
    streamKey,
    'MAXLEN',
    '~',
    STREAM_MAXLEN,
    '*',
    'payload',
    JSON.stringify(payload),
  );
}
```

Streams used:

- `STREAM_TOURNAMENT_MATCHES_READY` – payload includes `tournamentId` and a list of matches with participants.
- `STREAM_TOURNAMENT_STATE_UPDATED` – payload includes `tournamentId` to signal state changes.

Matchmaking consumes these streams via `MatchmakingRedisBridge`, as described above.

---

## 5. Summary

Redis in these services acts as:

- A **coordination bus**:
  - Pub/sub (`room_ready`) for room readiness events.
  - Streams for tournament messages.
- A **routing registry**:
  - `room-to-node:*` keys tell the gateway where each room lives.
- A **load map**:
  - `game-node:scores` hash is the allocator’s view of node health.
- A **safety net**:
  - Idempotency keys prevent duplicate room allocation.
  - Rate‑limit buckets protect matchmaking from abuse.

This makes the control plane **stateless** at the process level: any instance can answer questions by reading Redis, and failures of an individual process don’t corrupt the global view of online matches.
