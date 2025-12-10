# Node & Fastify in ft_transcendence – Overview

This document is a high‑level course on **how Node.js and Fastify are used in this project**:

- What “Node app” means in this repo.
- Why Fastify is the main server framework.
- Common patterns shared across services (logging, metrics, health checks, config).

For service‑specific details, see:

- `BackendServer.md` – main API server (`apps/backend`).
- `RealtimeServers.md` – matchmaking, chat, game gateway, and game server WS.
- `UtilityServices.md` – allocator, scorer, and other small Node services.

---

## 1. Node in this project (runtime + tooling)

Key characteristics:

- **Node version:** `>=22.19.0` (see `package.json` and individual app configs).
- **Package manager:** PNPM (`pnpm-workspace.yaml`).
- **TypeScript everywhere:**  
  All Node apps are written in TypeScript; most use:
  - `ts-node` / `tsx` for dev (`pnpm dev`).
  - `tsc` for builds (`pnpm build`).

Common patterns:

- Each service lives in `apps/<name>` with its own `package.json`, `tsconfig.json`, and `vite.config.ts` (for tests or bundling where needed).
- Shared utilities (logging, metrics, types) live under `packages/utils` and `packages/pong/*`.

---

## 2. Why Fastify?

Most Node services use **Fastify** instead of `http`/Express because it offers:

- **High performance** and low overhead.
- **Built‑in schema support** for request validation (especially in backend API).
- **Plugin system** for:
  - `@fastify/websocket` (matchmaking, chat, game server WS).
  - `@fastify/cors` (backend API).
  - `@fastify/static` and `@fastify/multipart` (file uploads).
  - `@fastify/swagger` + `@fastify/swagger-ui` (API docs).
- **Integration with Prometheus metrics** via `@utils/metrics` (custom wrapper around `fastify-metrics`).
- Clean logging integration with `@utils/logger` (`createFastifyLoggerConfig`).

This combination is used consistently so every service has:

- A structured JSON logger.
- A `/metrics` endpoint.
- A `/health` endpoint.

---

## 3. Common Fastify setup pattern

Most services start with something like:

```ts
import fastify from 'fastify';
import { registerMetrics } from '@utils/metrics';
import { createFastifyLoggerConfig } from '@utils/logger';

const app = fastify({
  logger: createFastifyLoggerConfig({ service: 'service-name' }),
});

registerMetrics(app, { labels: { service: 'service-name' } });
```

Patterns across services:

- **Logger:** `createFastifyLoggerConfig({ service })`:
  - In dev: pretty console logs.
  - In prod: ECS‑compatible JSON logs for ELK.

- **Metrics:** `registerMetrics(app, { labels: { service } })`:
  - Exposes `/metrics` with Prometheus metrics.
  - Adds labels like `service`, `env`, `version`.

- **Health endpoint:**

  ```ts
  app.get('/health', async () => ({ status: 'ok' }));
  ```

- **Listening:**

  ```ts
  await app.listen({ host: '0.0.0.0', port: PORT });
  ```

This pattern appears in:

- `apps/backend/index.ts`
- `apps/chat/index.ts`
- `apps/matchmaking/index.ts`
- `apps/game-gateway/index.ts`
- `apps/allocator/index.ts`
- `apps/scorer/index.ts`

The game server (`apps/game-server`) uses Fastify under the hood for its WS/HTTP infra, but is wrapped in its own `GameServer` class.

---

## 4. Types of Node/Fastify services in this repo

You can group services into a few categories:

1. **Backend API server** (`apps/backend`):
   - Fastify HTTP server.
   - Many routes, schemas, auth hooks.
   - Serves JSON APIs, static files (avatars), and Swagger UI.

2. **Realtime WebSocket servers**:
   - **Matchmaking** (`apps/matchmaking`) – `/matchmaking` WS endpoint.
   - **Chat** (`apps/chat`) – `/chat` WS endpoint.
   - **Game gateway** (`apps/game-gateway`) – handles WS upgrade for `/g/:roomId` and proxies.
   - **Game server WS** (`apps/game-server/src/infra/ws/WSServer.ts`) – `/g/:roomId` behind the gateway.

3. **Utility/control‑plane services**:
   - **Allocator** (`apps/allocator`) – HTTP service with a single `/allocate` endpoint.
   - **Scorer** (`apps/scorer`) – Fastify app used mostly as a timer/metrics collector with a `/health` endpoint.

4. **Scripts and maintenance**:
   - Migration scripts (`apps/backend/utils/migrate.ts`, `apps/backend/utils/rollback.ts`).
   - Matchmaking/game‑server maintenance and metrics patches (e.g. `initSqliteMetrics`).

Each of these categories is documented in more detail in the other Node docs.

---

## 5. Configuration via environment

All Node services rely heavily on **env‑driven config**, typically via small `config.ts` modules:

- Backend: `apps/backend/utils/config.ts`
- Matchmaking: `apps/matchmaking/utils/config.ts`
- Game gateway: `apps/game-gateway/config.ts`
- Allocator: `apps/allocator/utils/config.ts`
- Scorer: `apps/scorer/config.ts`
- Game server: `apps/game-server/src/app/Config.ts`

Common patterns:

- Ports and hosts:
  - `BACKEND_HOST`, `BACKEND_PORT`
  - `PORT` / `HOST` for chat, matchmaking, gateway, allocator, scorer.
- Secrets:
  - `JWT_SECRET`, `MATCH_SECRET`, `REALTIME_TOKEN_SECRET`, etc.
- Redis URL:
  - `REDIS_URL` (see Redis docs).
- Prometheus URL and game server endpoints for Scorer.

If you add a new service, follow the same pattern:

- Create a `config.ts` that reads and validates envs.
- Fail fast if required envs are missing.

---

## 6. How to read Node/Fastify code in this repo

When you open any service under `apps/`:

1. Look at its `index.ts` to see:
   - Fastify initialization.
   - Which plugins are registered (`websocket`, `cors`, `static`, `swagger`, etc.).
   - Which routes are registered.
   - How metrics and logging are set up.

2. Find its `config.ts` to understand:
   - Which ports it listens on.
   - Which external services (Redis, Prometheus, backend) it talks to.

3. Cross‑reference workflow docs:
   - Backend API → `docs/to0nsa/workflow/BackendAndAPIs.md`.
   - Matchmaking/gateway/game server → `docs/to0nsa/workflow/OnlinePongNetwork.md`, `MatchmakingService.md`, `GameNode.md`, `GatewayAndWebSockets.md`.

Together, this Node/Fastify doc and the others in `docs/to0nsa/node` give you a map for understanding and extending the backend side of ft_transcendence.
