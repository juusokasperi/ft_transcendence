# Redis in Tournaments and Backend Coordination

This document covers how **Redis is used to coordinate tournaments** between the backend API and the matchmaking service.

Read this together with:

- `docs/to0nsa/workflow/MatchmakingService.md`
- `docs/to0nsa/workflow/ResultsAndRanking.md`

---

## 1. Why tournaments use Redis

Tournament flows involve multiple moving parts:

- Backend DB tables for tournaments, matches, and participants.
- Backend code that decides bracket structure and progression.
- Matchmaking service that:
  - Manages tournament lobbies.
  - Schedules and starts individual matches.
  - Talks to allocator/game servers to create rooms.

Redis provides a **low‑latency, decoupled bridge** between:

- Backend tournament logic (writes to Redis).
- Matchmaking tournament engine (reads from Redis).

This avoids tight coupling or polling and keeps the system responsive under load.

---

## 2. Backend → matchmaking via Redis Streams

**File:** `apps/backend/services/matchmakingBridge.ts`

The backend exposes helper functions:

- `notifyMatchesReady(tournamentId, matchIds)`
- `notifyTournamentStateUpdated(tournamentId)`

Both publish to Redis streams:

```ts
import { Redis } from 'ioredis';
import { REDIS_URL } from '../utils/config.ts';
import {
  STREAM_TOURNAMENT_MATCHES_READY,
  STREAM_TOURNAMENT_STATE_UPDATED,
} from '@pong/shared/redis/constants';

const STREAM_MAXLEN = 1000;
const redis = new Redis(REDIS_URL);
```

### 2.1 MATCHES_READY stream

When the backend determines that certain tournament matches are ready to be scheduled:

```ts
const payload: MatchesReadyMessage = {
  tournamentId,
  matches: [
    {
      tournamentMatchId,
      stage: 'semifinal' | 'final' | 'bronze',
      participants: [
        { participantId, alias, userUuid, teamNumber },
        // ...
      ],
    },
  ],
};

await redis.xadd(
  STREAM_TOURNAMENT_MATCHES_READY,
  'MAXLEN',
  '~',
  STREAM_MAXLEN,
  '*',
  'payload',
  JSON.stringify(payload),
);
```

Properties:

- Stream name: `STREAM_TOURNAMENT_MATCHES_READY`.
- Field: `payload` containing JSON of tournament ID and ready matches.
- `MAXLEN ~ STREAM_MAXLEN` keeps only the most recent ~N entries, preventing unbounded growth.

### 2.2 STATE_UPDATED stream

For general tournament state changes (e.g., match results, participant changes), the backend writes:

```ts
await redis.xadd(
  STREAM_TOURNAMENT_STATE_UPDATED,
  'MAXLEN',
  '~',
  STREAM_MAXLEN,
  '*',
  'payload',
  JSON.stringify({ tournamentId }),
);
```

Matchmaking consumes this to refresh its representation of the tournament and lobby state.

---

## 3. Matchmaking’s Redis stream consumer

**File:** `apps/matchmaking/utils/MatchmakingRedisBridge.ts`

Matchmaking sets up a **consumer group** on both streams:

```ts
const TOURNAMENT_STREAM_KEYS = [STREAM_TOURNAMENT_MATCHES_READY, STREAM_TOURNAMENT_STATE_UPDATED];
const STREAM_GROUP = 'matchmaking-service';
```

On initialization:

- `xgroup CREATE` is used to ensure the consumer group exists.
- A background loop uses `XREADGROUP` to read from both streams (`>` for new entries, `0` for pending).

When messages arrive:

- For `STREAM_TOURNAMENT_MATCHES_READY`:
  - It deserializes `MatchesReadyMessage`.
  - Calls `onMatchesReady(payload)` with a typed payload.
  - Downstream code schedules tournament matches, calls allocator, and sends handoff messages.

- For `STREAM_TOURNAMENT_STATE_UPDATED`:
  - It deserializes `{ tournamentId }`.
  - Calls `onStateUpdated(payload)` to refresh tournament state and lobby views for connected clients.

Because this uses consumer groups:

- Multiple matchmaking instances can share the load.
- Messages are guaranteed to be processed at least once but not processed twice by the same group member.
- Pending entries are drained (via `drainPending`) on startup to avoid losing updates.

---

## 4. Tournaments and `room_ready` pub/sub

The **same Redis pub/sub mechanism** used for casual room readiness also supports tournaments:

- Game servers publish `room_ready` when a room is ready (regardless of mode).
- `MatchmakingRedisBridge` subscribes and calls `onRoomReady(roomIdentifier)`.
- Tournament scheduling code uses this to know when both participants have joined and the match can transition to “playing” in the tournament state machine.

Redis thus acts as a **multi‑purpose bus**:

- Streams for match scheduling/state changes.
- Pub/sub for room readiness.

---

## 5. Summary

In tournament flows, Redis enables:

- **Backend‑driven scheduling:** backend decides bracket and winners, then pushes events to streams.
- **Matchmaking‑driven execution:** matchmaking reads streams and translates events into:
  - Lobby updates.
  - Scheduled matches.
  - Allocator/game‑server calls.
- **Loose coupling and resilience:** if matchmaking is briefly down, events accumulate in the streams; on restart, it drains pending entries and catches up.

This keeps tournament logic **authoritative in the backend** while letting matchmaking and game servers handle the real‑time aspects, all stitched together by Redis.
