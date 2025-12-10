# Allocator & Scorer – Capacity and Load Balancing for Online Pong

This document explains the two services that sit between matchmaking and the game nodes:

- **Allocator** (`apps/allocator`)
- **Scorer** (`apps/scorer`)

Together they:

- Decide **which game node** hosts each new room (capacity and load).
- Maintain a **score table** in Redis (`game-node:scores`) so matchmaking can pick healthy nodes.
- Register rooms on the chosen game server and mint **join tokens** for players.

You should already be familiar with:

- `MatchmakingService.md` – how matchmaking calls Allocator.
- `GameNode.md` – what a game server does once a room is created.
- `DeploymentOnlinePong.md` – where these services run in Docker.

For implementation details of underlying tech, you can also see:

- `docs/to0nsa/redis/MatchmakingAndAllocator.md` – Redis keys and flows used by allocator and scorer.
- `docs/to0nsa/node/UtilityServices.md` – Node/Fastify setup for allocator and scorer services.

---

## 1. Allocator – what it does

File: `apps/allocator/index.ts`

The **Allocator** is a small HTTP service with a single main responsibility:

Given a matchmaking request `{ mode, players, randomSeed, simulationStartTick, tournament }`, choose an appropriate game node, create a room on that node, and return:

- a `roomIdentifier`
- an endpoint URL (`/g/:roomIdentifier`)
- a per‑player **join token** map.

It is stateless apart from:

- Redis for:
  - Idempotency cache (avoid duplicate allocation).
  - `room-to-node:${roomIdentifier}` mapping.

### 1.1 `/allocate` endpoint

Main handler:

```ts
import { ADMIN_SECRET, PORT, REDIS_URL, IDEMPOTENCY_PREFIX } from './utils/config.ts';
import fastify from 'fastify';
import { v4 as uuid } from 'uuid';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { signJoinToken } from '@pong/shared/auth/tokenSign';
import type { JoinTokenClaims, TournamentContext } from '@pong/shared/protocol/net';
import axios from 'axios';
import Redis from 'ioredis';
import { AllocateSchema } from './utils/schema.ts';
import { registerMetrics } from '@utils/metrics';
import { log } from '@utils/logger';

const redis = new Redis(REDIS_URL);
const app = fastify();

registerMetrics(app, { labels: { service: 'allocator' } });

app.post('/allocate', { schema: AllocateSchema }, async (request, reply) => {
  // ...
});
```

`AllocateSchema` (in `utils/schema.ts`) enforces:

- `idempotencyKey`: UUID per allocation request.
- `mode`: `'ranked' | 'tournament' | 'invite'`.
- `players`: array of `{ playerIdentifier, side, mmr, tournamentParticipantId?, alias? }`.
- `simulationStartTick`: when the server sim should start.
- `randomSeed`: seed for deterministic game logic.
- Optional `tournament` context.

### 1.2 Idempotency

At the top of the handler:

```ts
const cached = await redis.get(IDEMPOTENCY_PREFIX + idempotencyKey);
if (cached) {
  log('Idempotency cache hit', { idempotencyKey, cached: JSON.parse(cached) });
  return reply.send(JSON.parse(cached));
}
```

Reason:

- Matchmaking might retry an allocation (e.g., due to network glitch).
- With `idempotencyKey`, repeated calls return the **same allocation** (room + tokens) instead of creating duplicates.

Result:

- More robust control plane.
- Safe to retry `/allocate` without duplicating rooms.

### 1.3 Choosing a game node

The allocator reads node scores from Redis:

```ts
const nodeScores = await redis.hgetall('game-node:scores');
let bestScore = Infinity;
let bestNodeInfo = null;
for (const [, value] of Object.entries(nodeScores)) {
  const nodeInfo = JSON.parse(value as string);
  if (typeof nodeInfo.score === 'number' && nodeInfo.score < bestScore) {
    bestScore = nodeInfo.score;
    bestNodeInfo = nodeInfo;
  }
}

if (!bestNodeInfo) {
  return reply.status(503).send({ message: 'No available game nodes' });
}

const nodeUrl = `${bestNodeInfo.http}`;
const wsNodeUrl = `${bestNodeInfo.ws}`;
await redis.set(`room-to-node:${roomIdentifier}`, wsNodeUrl, 'EX', 900);
```

Notes:

- `game-node:scores` is a Redis hash populated by **Scorer** (`apps/scorer`).
  - Each entry is `{ id, http, ws, score }`.
  - Lower `score` = less loaded / more desirable.
- Allocator simply picks the **lowest** score node.
- `room-to-node:${roomIdentifier}` is written:
  - Maps room → a `ws` URL (where the game node WebSocket server lives).
  - Expiration (`EX 900`) ensures stale rooms are eventually cleaned up.
  - This key is used later by the **gateway** to route `/g/:roomId` connections.

### 1.4 Creating a room on the game server

Once a node is chosen, the allocator calls the node’s HTTP admin:

```ts
await axios.post(
  `${nodeUrl}/admin/rooms`,
  {
    idempotencyKey,
    roomIdentifier,
    capacity: players.length,
    expectedPlayers: players,
    randomSeed,
    simulationStartTick,
    joinDeadlineAtEpochMs,
    tournament,
  },
  {
    headers: {
      'X-Admin-Secret': ADMIN_SECRET,
    },
  },
);
```

Game server side (`GameServer` + HTTP infra):

- Validates `X-Admin-Secret`.
- Calls `RoomRegistry.registerRoom` with `CreateRoomRequest`.
- Room is now known to the node, but no players have connected yet.

### 1.5 Minting join tokens

After successfully registering the room, the allocator creates per‑player **join tokens**:

```ts
const perPlayerJoinTokens: Record<string, string> = {};
const nowSec = Math.floor(Date.now() / 1000);
const expSec = nowSec + 60;
for (const p of players) {
  const claims: JoinTokenClaims = {
    iss: 'mm',
    aud: 'game-node',
    iat: nowSec,
    exp: expSec,
    jti: uuid(),
    roomIdentifier,
    sub: p.playerIdentifier,
    side: p.side,
    simulationStartTick,
  };
  if (mode === 'tournament' && tournament) {
    claims.tournamentId = tournament.tournamentId;
    claims.tournamentMatchId = tournament.tournamentMatchId;
    claims.tournamentStage = tournament.tournamentStage;
  }
  perPlayerJoinTokens[p.playerIdentifier] = signJoinToken(claims);
}
```

Important fields in `JoinTokenClaims`:

- `iss: 'mm'` – issued by matchmaking/allocator.
- `aud: 'game-node'` – consumed by game nodes.
- `roomIdentifier` – which room this token grants access to.
- `sub` – player identifier.
- `side` – `'east'` or `'west'` (initial paddle side).
- `simulationStartTick` – sync point for deterministic start.
- `exp` + `jti` – TTL and unique ID; gateway enforces single‑use via Redis.

The result sent back to matchmaking:

```ts
const endpointUrl = `/g/${roomIdentifier}`;
const response = {
  roomIdentifier,
  endpointUrl,
  perPlayerJoinTokens,
};
await redis.set(IDEMPOTENCY_PREFIX + idempotencyKey, JSON.stringify(response), 'EX', 300);
return reply.send(response);
```

Matchmaking stores this and builds the `HANDOFF` message for the client (see `MatchmakingService.md`).

---

## 2. Scorer – how it feeds node scores

File: `apps/scorer/index.ts` + `apps/scorer/config.ts`

The **Scorer** is a background service that periodically:

- Gathers metrics per game node (CPU, FDs, number of matches).
- Computes a normalized **score** for each node.
- Writes scores into Redis under `game-node:scores`.

Allocator uses these scores to place new rooms.

### 2.1 Configuration

`apps/scorer/config.ts`:

```ts
const REQUIRED = [
  'PROMETHEUS_URL',
  'REDIS_URL',
  'GAME_NODES_AMOUNT',
  'GAME_SERVER_PORT',
  'GAME_SERVER_HTTP',
  'SCORER_PORT',
] as const;
// ...
export const REDIS_URL = process.env.REDIS_URL!;
export const PROMETHEUS_URL = process.env.PROMETHEUS_URL!;
export const GAME_SERVER_SERVICE = 'game-server';
export const GAME_SERVER_PORT = process.env.GAME_SERVER_PORT!;
export const GAME_SERVER_HTTP = process.env.GAME_SERVER_HTTP!;
export const GAME_NODES_AMOUNT = Number(process.env.GAME_NODES_AMOUNT!);
export const SCORER_PORT = Number(process.env.SCORER_PORT!);
```

Env variables tell Scorer:

- Where Prometheus is (`PROMETHEUS_URL`).
- How many game server nodes exist, and where (`GAME_NODES_AMOUNT`, `GAME_SERVER_*`).
- Which Redis instance to update.

### 2.2 Node discovery

At startup, Scorer builds a list of node endpoints:

```ts
const nodes = Array.from({ length: GAME_NODES_AMOUNT }, (_, idx) => {
  const id = `${GAME_SERVER_SERVICE}-${idx + 1}`;
  const http = `http://${GAME_SERVER_SERVICE}-${idx + 1}:${GAME_SERVER_HTTP}`;
  const ws = `ws://${GAME_SERVER_SERVICE}-${idx + 1}:${GAME_SERVER_PORT}`;
  return { id, http, ws };
});
```

Example:

- If `GAME_NODES_AMOUNT=2`, you get:
  - Node 1: id `game-server-1`, HTTP `http://game-server-1:55554`, WS `ws://game-server-1:55553`.
  - Node 2: id `game-server-2`, HTTP `http://game-server-2:55554`, WS `ws://game-server-2:55553`.

These service names match the game-server containers in `docker-compose-prod.yml`.

### 2.3 Fetching metrics

Scorer prefers Prometheus, with HTTP fallback:

- Prometheus path:

  ```ts
  async function getMetricsFromPrometheus() {
    const cpuQuery = 'avg by (instance) (rate(process_cpu_seconds_total[1m]))';
    const fdQuery = 'process_open_fds';
    const maxFdQuery = 'process_max_fds';
    const matchesQuery = 'game_server_matches';

    const [cpuResponse, fdResponse, maxFdResponse, matchesResponse] = await Promise.all([
      axios.get(`${PROMETHEUS_URL}/api/v1/query`, { params: { query: cpuQuery } }),
      axios.get(`${PROMETHEUS_URL}/api/v1/query`, { params: { query: fdQuery } }),
      axios.get(`${PROMETHEUS_URL}/api/v1/query`, { params: { query: maxFdQuery } }),
      axios.get(`${PROMETHEUS_URL}/api/v1/query`, { params: { query: matchesQuery } }),
    ]);
    // Build metricsByNode map...
  }
  ```

- HTTP fallback:

  ```ts
  async function updateScoresFromHttpFallback() {
    for (const node of nodes) {
      const res = await axios.get(`${node.http}/metrics`, { timeout: 2000 });
      const metricsText = res.data;
      const fd = parsePrometheusText(metricsText, 'process_open_fds');
      const maxFds = parsePrometheusText(metricsText, 'process_max_fds') || 1024;
      const matches = parsePrometheusText(metricsText, 'game_server_matches');
      // Compute score...
      await redis.hset('game-node:scores', node.id, JSON.stringify({ id, http, ws, score, fallback: true }));
    }
  }
  ```

### 2.4 Calculating scores

Main scoring logic:

```ts
const MATCHES_SOFT_CAP = 64; // for example

async function updateScores() {
  const metricsByNode = await getMetricsFromPrometheus();

  for (const node of nodes) {
    const metrics = metricsByNode.get(node.id);
    if (!metrics) {
      await redis.hdel('game-node:scores', node.id);
      continue;
    }

    const cpuLoad = metrics.cpu;
    const fdLoad = metrics.fd / (metrics.maxFds || 1);
    const matchesLoad = metrics.matches / MATCHES_SOFT_CAP;
    const score = cpuLoad * 0.5 + fdLoad * 0.2 + matchesLoad * 0.3;

    await redis.hset(
      'game-node:scores',
      node.id,
      JSON.stringify({
        id: node.id,
        http: node.http,
        ws: node.ws,
        score: Number(score.toFixed(4)),
      }),
    );
  }
}
```

Interpretation:

- `cpuLoad` – average CPU usage per node.
- `fdLoad` – fraction of open file descriptors.
- `matchesLoad` – how full the node is relative to a soft cap of matches.
- Score is a weighted sum:
  - CPU (50%) – avoid overheated nodes.
  - FDs (20%) – avoid nodes near OS limits.
  - Concurrent matches (30%) – spread games across nodes.

Lower score = healthier / less loaded node.

This runs on a timer:

```ts
await app.listen({ port: SCORER_PORT, host: '0.0.0.0' });
setInterval(updateScores, 5000);
updateScores();
```

So every 5 seconds, `game-node:scores` is refreshed based on the latest metrics.

---

## 3. How Allocator and Scorer interact with the rest of the stack

Putting the pieces together (simplified flow):

1. **Game servers** expose metrics:
   - Internal `/metrics` endpoint and Prometheus scraping (configured elsewhere).
   - Metrics include:
     - `game_server_matches` – active matches.
     - `process_open_fds` / `process_max_fds` – resource usage.
     - CPU usage via `process_cpu_seconds_total`.

2. **Scorer** polls metrics:
   - From Prometheus (`PROMETHEUS_URL`) or direct HTTP.
   - Computes scores and writes them into Redis hash `game-node:scores`.

3. **Matchmaking** needs a room:
   - It calls `Allocator /allocate` with `{ idempotencyKey, mode, players, randomSeed, simulationStartTick, tournament? }`.

4. **Allocator** chooses a node:
   - Reads `game-node:scores`.
   - Picks the node with lowest `score`.
   - Writes `room-to-node:${roomId}` → `node.wsUrl` in Redis (used by gateway).

5. **Allocator** creates room and join tokens:
   - Calls `node.http/admin/rooms` with room details.
   - Registers the room in the game server’s `RoomRegistry`.
   - Generates per‑player join tokens and returns them to matchmaking.

6. **Matchmaking** sends `HANDOFF` to clients:
   - Includes `endpointUrl`, `roomIdentifier`, and **their personal join token**.

7. **Gateway** and **Game Node**:
   - Gateway uses `room-to-node:${roomId}` to proxy `/g/:roomId`.
   - Game Node uses `RoomRegistry` + `AuthService` to admit players based on join tokens.

So Allocator & Scorer form the **capacity and placement layer**:

- Scorer maintains a live view of node load.
- Allocator uses that view to place each new room fairly and safely.

---

## 4. What you need to know to work on them

### 4.1 Extending Allocator

Examples of changes you might make:

- **Add new allocation policies**:
  - E.g., prefer nodes in a region or with fewer tournament games.
  - You’d adjust how `nodeScores` is read and interpreted.

- **Change join token shape**:
  - Add fields to `JoinTokenClaims` in `protocol/net.ts` (e.g., extra metadata).
  - Update allocator to fill those fields.
  - Update game server’s token verification/usage if needed.

- **Modify idempotency behavior or TTLs**:
  - Change `IDEMPOTENCY_PREFIX` or Redis `EX` times.

Whenever you change the allocation output, ensure:

- Matchmaking still understands the response.
- Gateway and Game Node still validate tokens correctly.

### 4.2 Extending Scorer

Possible changes:

- **Adjust scoring weights**:
  - Change the coefficients for CPU / FDs / matches to better fit real load.

- **Add new metrics**:
  - Use additional Prometheus metrics (latency, error rate) to influence score.

- **Change the number of game nodes**:
  - Update `GAME_NODES_AMOUNT` and related env to match your deployment.

When changing Scorer:

- Make sure the `id`, `http`, and `ws` fields written into `game-node:scores` remain correct; Allocator relies on them.
- Keep `updateScores` robust — if metrics are missing, Scorer should drop nodes from scores or mark them as high‑score/unavailable.

---

## 5. Summary

Allocator and Scorer are small but critical services:

- **Scorer** continuously measures **how busy each game node is** and writes normalized scores to Redis.
- **Allocator** uses those scores to decide where to place new **rooms**, then:
  - Registers the room on a game server.
  - Writes the `room-to-node` mapping for the gateway.
  - Generates join tokens for each player.

Together, they ensure:

- Load is spread across game nodes.
- Players are routed to the right node via gateway.
- Matchmaking can confidently create rooms without worrying about capacity details.

With this, you now have a full picture of the capacity/placement layer that sits between matchmaking and the game servers in the online Pong stack.
