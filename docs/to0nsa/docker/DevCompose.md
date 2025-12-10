# Dev Docker Compose – `docker-compose.yml`

This document explains how the **dev Docker Compose file** (`docker-compose.yml`) is structured:

- What each service does in dev.
- How volumes and networks are used.
- How to run the dev stack.

It assumes you’ve read `Docker.md` for the high‑level overview.

---

## 1. Volumes and network

Top of `docker-compose.yml`:

```yaml
volumes:
  pnpm-store: {}
  node_modules: {}
  frontend_node_modules: {}
  backend_node_modules: {}
  render_node_modules: {}
  matchmaking_node_modules: {}
  game_server_node_modules: {}
  chat_node_modules: {}
  allocator_node_modules: {}
  scorer_node_modules: {}
  redis_data: {}
  game_gateway_node_modules: {}

networks:
  devnet:
    driver: bridge
```

- Named volumes keep:
  - PNPM store and various `node_modules` directories for fast dev installs.
  - Redis data (`redis_data`) and backend SQLite data/uploads (mounted separately).
- All services share the `devnet` bridge network, so they can reach each other by name (`backend`, `frontend`, `redis`, etc.).

---

## 2. `deps` – one‑time dependency installer

Service:

```yaml
deps:
  image: node:22-bookworm
  working_dir: /work
  environment:
    PNPM_STORE_DIR: /pnpm/store
    COREPACK_ENABLE_DOWNLOAD_PROMPT: '0'
    COREPACK_HOME: /tmp/corepack
  command: >
    bash -lc "
      corepack pnpm --version &&
      corepack pnpm install --frozen-lockfile &&
      corepack pnpm run --if-present build:libs
    "
  volumes:
    - .:/work:cached
    - pnpm-store:/pnpm/store
    - node_modules:/work/node_modules
    - frontend_node_modules:/work/apps/frontend/node_modules
    - backend_node_modules:/work/apps/backend/node_modules
    - render_node_modules:/work/packages/pong/render/node_modules
    - matchmaking_node_modules:/work/apps/matchmaking/node_modules
    - game_server_node_modules:/work/apps/game-server/node_modules
    - allocator_node_modules:/work/apps/allocator/node_modules
    - game_gateway_node_modules:/work/apps/game-gateway/node_modules
    - scorer_node_modules:/work/apps/scorer/node_modules
    - chat_node_modules:/work/apps/chat/node_modules
```

Purpose:

- Install dependencies once for the whole repo.
- Build shared libraries (`packages/pong/*`) via `build:libs`.
- Seed `node_modules` volumes used by other services.

Other services depend on `deps` so they start only after dependencies are installed.

---

## 3. Frontend dev server (`frontend`)

Service:

```yaml
frontend:
  image: node:22-bookworm
  init: true
  working_dir: /work/apps/frontend
  environment:
    PNPM_STORE_DIR: /pnpm/store
    CHOKIDAR_USEPOLLING: 'true'
    WATCHPACK_POLLING: 'true'
  command: bash -lc "corepack pnpm dev"
  depends_on:
    deps:
      condition: service_completed_successfully
  ports:
    - '${FRONTEND_PORT:-5173}:5173'
  volumes:
    - .:/work:cached
    - pnpm-store:/pnpm/store
    - node_modules:/work/node_modules:ro
    - frontend_node_modules:/work/apps/frontend/node_modules
    - render_node_modules:/work/packages/pong/render/node_modules:ro
```

Notes:

- Runs Vite dev server on port 5173 (exposed to the host).
- Mounts the repo so you can edit files on the host and see hot reloads.

---

## 4. Backend dev server (`backend`)

Service:

```yaml
backend:
  image: node:22-bookworm
  init: true
  working_dir: /work/apps/backend
  env_file:
    - ./.env
  environment:
    PNPM_STORE_DIR: /pnpm/store
    ENABLE_SQLITE_METRICS: ${ENABLE_SQLITE_METRICS:-false}
  command: bash -lc "corepack pnpm dev"
  depends_on:
    deps:
      condition: service_completed_successfully
  ports:
    - '${BACKEND_PORT:-3001}:3001'
  volumes:
    - .:/work:cached
    - pnpm-store:/pnpm/store
    - node_modules:/work/node_modules:ro
    - backend_node_modules:/work/apps/backend/node_modules:ro
    - ./apps/backend/data/sqlite:/data
    - ./apps/backend/data/sqlite/uploads:/data/uploads
```

Notes:

- Runs `pnpm dev` (Fastify with `tsx` watch) on port 3001.
- SQLite DB and uploads are persisted on the host (`./apps/backend/data/sqlite`).

---

## 5. Nginx dev gateway (`nginx`)

Service:

```yaml
nginx:
  image: nginx:1.27-alpine
  depends_on:
    - frontend
    - backend
  ports:
    - '${NGINX_PORT:-8080}:80'
  volumes:
    - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
```

Purpose:

- Provides a single origin (`http://localhost:8080`) that:
  - Proxies `/` to the Vite dev server.
  - Proxies `/api/` and `/uploads/` to the backend.
  - Proxies WS endpoints (`/matchmaking`, `/g/`, `/chat`) to respective services.

See `docs/to0nsa/nginx/NginxDevConfig.md` for details.

---

## 6. Online Pong services in dev

### 6.1 Matchmaking (`matchmaking-service`)

Runs the matchmaking WS server:

```yaml
matchmaking-service:
  image: node:22-bookworm
  working_dir: /work/apps/matchmaking
  env_file:
    - .env
  command: bash -lc "corepack enable && corepack prepare pnpm@${PNPM_VERSION:-9.12.3} --activate && pnpm dev"
  depends_on:
    deps:
      condition: service_completed_successfully
    allocator:
      condition: service_started
```

- Uses `.env` for config (ports, Redis URL, secrets).
- Depends on `allocator` since it calls it to place rooms.

### 6.2 Game server (`game-server`)

There’s a template for game server containers:

```yaml
game-server: &game-server-template
  image: node:22-bookworm
  working_dir: /work/apps/game-server
  env_file:
    - .env
  command: bash -lc "corepack enable && corepack prepare pnpm@${PNPM_VERSION:-9.12.3} --activate && pnpm dev"
  depends_on:
    deps:
      condition: service_completed_successfully
```

In dev, usually a single `game-server` instance is used.

### 6.3 Game gateway (`game-gateway`)

WS gateway service:

```yaml
game-gateway:
  image: node:22-bookworm
  working_dir: /work/apps/game-gateway
  env_file:
    - .env
  command: bash -lc "corepack enable && corepack prepare pnpm@${PNPM_VERSION:-9.12.3} --activate && pnpm dev"
  depends_on:
    deps:
      condition: service_completed_successfully
    game-server:
      condition: service_started
```

### 6.4 Chat service (`chat-service`)

WS chat server:

```yaml
chat-service:
  image: node:22-bookworm
  working_dir: /work/apps/chat
  env_file:
    - .env
  command: bash -lc "corepack enable && corepack prepare pnpm@${PNPM_VERSION:-9.12.3} --activate && pnpm dev"
```

### 6.5 Allocator and scorer

- `allocator` – small HTTP service to place rooms.
- `scorer` – periodic metrics collector writing node scores into Redis.

Both are Node containers using `.env` and shared PNPM store.

### 6.6 Redis

Dev Redis:

```yaml
redis:
  image: redis:8.2.1-alpine
  volumes:
    - redis_data:/data
  ports:
    - '6379:6379'
```

- Shared by matchmaking, allocator, game server, scorer, backend tournament bridge.

---

## 7. Running the dev stack

Typical workflow:

1. Ensure you have a `.env` file with required variables (see `.env.example`).
2. Start the stack:

   ```sh
   docker compose up
   ```

3. Access:
   - Frontend (Vite): `http://localhost:5173`
   - Backend API: `http://localhost:3001`
   - Single‑origin dev via Nginx: `http://localhost:8080`

You can stop everything with `docker compose down`. Volumes (`pnpm-store`, `node_modules`, DB data) persist between runs unless removed.
