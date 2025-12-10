# Utility Node Services – Allocator and Scorer

This document covers the smaller Node/Fastify services that support online Pong:

- Allocator (`apps/allocator`)
- Scorer (`apps/scorer`)

They are simpler than the main API or realtime servers, but they follow the same Node/Fastify patterns.

For their functional roles, see:

- `docs/to0nsa/workflow/AllocatorAndScorer.md`

---

## 1. Allocator (`apps/allocator`)

**File:** `apps/allocator/index.ts`

Purpose:

- Given a matchmaking request, choose a game node, register a room, and mint join tokens.

Fastify setup:

```ts
import fastify from 'fastify';
import { registerMetrics } from '@utils/metrics';

const app = fastify();
registerMetrics(app, { labels: { service: 'allocator' } });
```

Route:

```ts
app.post('/allocate', { schema: AllocateSchema }, async (request, reply) => {
  // 1. Read idempotencyKey, mode, players, randomSeed, simulationStartTick, tournament.
  // 2. Check Redis idempotency cache.
  // 3. Pick best node from game-node:scores.
  // 4. POST /admin/rooms to game server.
  // 5. Generate per-player join tokens.
  // 6. Cache result and return { roomIdentifier, endpointUrl, perPlayerJoinTokens }.
});
```

Notes:

- No WebSocket usage here; it’s a pure HTTP control‑plane service.
- Uses `AllocateSchema` to validate requests with Fastify’s schema support.
- Uses Redis (via `ioredis`) and Axios inside the handler; Fastify just provides the HTTP interface, metrics, and logging.

Startup:

```ts
app.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) throw err;
  log(`Server started on port ${PORT}`);
});
```

---

## 2. Scorer (`apps/scorer`)

**File:** `apps/scorer/index.ts`

Purpose:

- Periodically compute **load/health scores** for all game nodes, then write those scores into Redis for Allocator to use.

Fastify setup:

```ts
const app = fastify({
  logger: createFastifyLoggerConfig({ service: 'scorer' }),
});

registerMetrics(app, { labels: { service: 'scorer' } });

app.get('/health', async () => ({ status: 'ok' }));
```

Runtime logic:

```ts
const start = async () => {
  try {
    await app.listen({ port: SCORER_PORT, host: '0.0.0.0' });
    app.log.info({ nodes: nodes.map((n) => n.id), prometheusUrl: PROMETHEUS_URL }, '[Scorer] Running scorer with nodes');
    setInterval(updateScores, 5000);
    updateScores();
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
```

Where `updateScores`:

- Queries Prometheus or `/metrics` endpoints on game servers via Axios.
- Computes normalized scores per node.
- Writes them into the `game-node:scores` Redis hash.

Fastify here:

- Provides a minimal HTTP server for `/health` and `/metrics`.
- Hosts the logging/metrics context for the background loop (`setInterval`).

---

## 3. Patterns to reuse for new utility services

If you add another small control‑plane/utility Node service:

1. **Use Fastify** with:
   - `createFastifyLoggerConfig` for logging.
   - `registerMetrics` for `/metrics`.
   - `/health` for simple liveness checks.
2. **Keep handlers small and focused**:
   - One or a few endpoints (`/allocate`, `/something`) that do a well‑defined job.
   - Use schemas for input validation if they take structured JSON bodies.
3. **Wire external dependencies** as in existing services:
   - Use `ioredis` for Redis.
   - Use Axios for HTTP calls to other services.
   - Use small `config.ts` modules to read env vars and fail fast if misconfigured.

Following these patterns keeps new Node services consistent with the rest of the stack and easy to monitor and operate.

