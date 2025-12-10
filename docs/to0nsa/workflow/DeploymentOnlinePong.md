# Deploying the Online Pong Stack (Docker & Networks)

This document explains **how the services for the online Pong game are deployed** with Docker and how they talk to each other over Docker networks.

It’s based on:

- `docker-compose.yml` (dev)
- `docker-compose-prod.yml` (prod)
- The workflow docs you already have (matchmaking, gateway, game node, browser).

For more on the building blocks:

- `docs/to0nsa/docker/Docker.md` – how Docker/Compose organize services, volumes, and networks.
- `docs/to0nsa/docker/DevCompose.md` – dev stack layout and how to run it locally.
- `docs/to0nsa/docker/ProdCompose.md` – prod stack layout, healthchecks, and image builds.
- `docs/to0nsa/node/NodeAndFastify.md` – how the Node/Fastify services are structured.
- `docs/to0nsa/redis/Redis.md` – how Redis fits into the online Pong control plane.
- `docs/to0nsa/nginx/Nginx.md` – how Nginx routes and protects traffic in front of these services.

You may want to read this together with:

- `OnlinePongNetwork.md` – high‑level player journey from browser to game node.
- `MatchmakingService.md` – queues, pairing, and handoff.
- `AllocatorAndScorer.md` – how rooms are placed on game nodes.
- `GatewayAndWebSockets.md` – how `/g/:roomId` is routed to game servers.

You’ll learn:

1. Which containers are involved in online Pong.
2. How networks and ports are wired (dev vs prod).
3. How traffic flows from browser → Nginx → backend/matchmaking/gateway/game‑server.
4. How Redis/Scorer/Allocator fit into the picture.

---

## 1. Services involved in online Pong

The full app has many services; for **online Pong** the key ones are:

- **frontend** – Vite dev server (dev) / static build behind Nginx (prod).
- **backend** – HTTP API (auth, user profile, stats, etc.).
- **matchmaking-service** – WebSocket matchmaking (queues, tournaments, invites).
- **allocator** – Decides which game node hosts a room, informs game server and gateway via Redis.
- **game-server** (Game Node) – Runs server‑authoritative Pong rooms.
- **game-gateway** – WebSocket gateway for `/g/:roomId`.
- **chat-service** – Real‑time chat/presence WebSocket server.
- **redis** – Shared store for matchmaking, allocator, game server, scorer.
- **scorer** – Consumes results and applies scoring/MMR updates.
- **nginx** – Public entrypoint (terminates HTTP/HTTPS, routes to services).

In dev, these are mostly run from Node images with `pnpm dev`; in prod they are built into dedicated images via `node.template.dockerfile`.

---

## 2. Networks and topologies

### 2.1 Dev: single `devnet` bridge

In `docker-compose.yml`:

```yaml
networks:
  devnet:
    driver: bridge
```

Most services join `devnet`, including:

- `frontend`
- `backend`
- `matchmaking-service`
- `game-server`
- `game-gateway`
- `chat-service`
- `allocator`
- `redis`
- `scorer`
- `nginx`

This means:

- Containers can talk to each other by service name (`http://backend:3001`, `ws://matchmaking-service:4242`, etc.).
- The host exposes only a few published ports:
  - Frontend dev UI: `${FRONTEND_PORT:-5173}` → `frontend:5173`.
  - Backend HTTP: `${BACKEND_PORT:-3001}` → `backend:3001`.
  - Nginx: `${NGINX_PORT:-8080}` → `nginx:80` (optional single‑origin dev).

The browser usually hits `http://localhost:5173` (Vite dev server) directly, and the Vite proxy / Nginx dev config route API/WebSocket calls to the right containers.

### 2.2 Prod: `prod-public` and `prod-private`

In `docker-compose-prod.yml`:

```yaml
networks:
  prod-public:
    driver: bridge
  prod-private:
    driver: bridge
```

Separation:

- **`prod-public`**:
  - Only `nginx` is attached.
  - Exposes ports to the outside world:
    - `80` (HTTP) and `443` (HTTPS).
    - Optional management ports (stub status, monitoring).

- **`prod-private`**:
  - Internal services only:
    - `backend`
    - `matchmaking-service`
    - `game-server`, `game-server-2`
    - `game-gateway`
    - `chat-service`
    - `allocator`
    - `redis`
    - `scorer`
  - Not directly exposed to the internet.

Nginx sits in both networks and routes external requests into the **private** network using service names and ports.

---

## 3. Dev compose – how the services run

### 3.1 Core dev services (simplified)

From `docker-compose.yml`:

- `deps`:
  - Runs `pnpm install` and `pnpm run build:libs` once.
  - Mounts the entire repo and `pnpm-store`.
  - Fills named volumes with `node_modules` for each service.

- `frontend`:
  - `node:22` image, `working_dir: /work/apps/frontend`.
  - Command: `corepack pnpm dev` (Vite).
  - Exposes port `5173` to host.

- `backend`:
  - `node:22`, `working_dir: /work/apps/backend`.
  - Command: `corepack pnpm dev` (Fastify + tsx watch).
  - Exposes port `3001`.
  - Mounts SQLite data directories so you can inspect DB on host.

- `matchmaking-service`:
  - `node:22`, `working_dir: /work/apps/matchmaking`.
  - Command: `pnpm dev` (WebSocket server + Redis).
  - Depends on `deps` + `allocator`.

- `game-server`:
  - `node:22`, `working_dir: /work/apps/game-server`.
  - Command: `pnpm dev` (Game Node WS + HTTP admin).

- `game-gateway`:
  - `node:22`, `working_dir: /work/apps/game-gateway`.
  - Command: `pnpm dev` (Fastify + http-proxy).

- `allocator`, `chat-service`, `scorer`, `redis`, `nginx`:
  - Similar dev setups with `pnpm dev` or simple runtime commands.

Because everything shares `devnet`, each service can use stable hostnames:

- `http://backend:3001`
- `ws://matchmaking-service:4242` (port from env)
- `ws://game-gateway:55550/g/:roomId`
- `ws://chat-service:6262/chat`

In dev, you often access services directly by host ports (e.g. `localhost:3001`, `localhost:8080`), while internal services talk on `devnet` by container name.

---

## 4. Prod compose – how online Pong is exposed

### 4.1 Nginx as the public entrypoint

In `docker-compose-prod.yml`, `nginx`:

```yaml
nginx:
  image: nginxinc/nginx-unprivileged:1.29-alpine
  depends_on:
    backend:
      condition: service_started
    game-server:
      condition: service_started
    frontend-builder:
      condition: service_completed_successfully
  ports:
    - '${NGINX_PORT:-80}:80'
    - '${NGINX_HTTPS_PORT:-443}:443'
    - '127.0.0.1:8082:8082'
  environment:
    - BACKEND_PORT=${BACKEND_PORT:-3001}
    - MATCHMAKING_PORT=${MATCHMAKING_PORT:-4242}
    - GATEWAY_PORT=${GATEWAY_PORT:-55550}
    - GAME_SERVER_PORT=${GAME_SERVER_PORT:-55553}
    - CHAT_PORT=${CHAT_PORT:-6262}
    # ...
  volumes:
    - ./nginx/prod.conf.template:/etc/nginx/templates/default.conf.template:ro
    - frontend_dist:/usr/share/nginx/html:ro
    - ./certs:/etc/nginx/certs:ro
  networks:
    - prod-public
    - prod-private
```

Nginx:

- Serves **static frontend files** from `frontend_dist` (output of `frontend-builder`).
- Proxies:
  - `/_api` routes to `backend`.
  - WebSocket routes:
    - `/matchmaking` → `matchmaking-service:${MATCHMAKING_PORT}`.
    - `/g/:roomId` → `game-gateway:${GATEWAY_PORT}`.
    - `/chat` → `chat-service:${CHAT_PORT}`.
- Terminates TLS using certs mounted into `/etc/nginx/certs`.

From the browser’s point of view:

- Everything comes from a single origin (`https://your-domain`):
  - React app.
  - REST APIs.
  - WebSocket endpoints for matchmaking, game, and chat.

### 4.2 Internal services in `prod-private`

Each core service is built via `node.template.dockerfile` and placed on `prod-private`:

- **Backend** (`apps/backend`):
  - Serves HTTP API on `BACKEND_PORT`.
  - Nginx forwards `/api/...` there.

- **Matchmaking service** (`apps/matchmaking`):
  - Listens on `MATCHMAKING_PORT`.
  - Nginx forwards `/matchmaking` WebSockets there.

- **Game server(s)** (`apps/game-server`):
  - Listen on `GAME_SERVER_WS` (for game WebSockets) and `GAME_SERVER_HTTP` (for admin/health).
  - There can be multiple game-server containers (`game-server` and `game-server-2`) for scaling.

- **Game gateway** (`apps/game-gateway`):
  - Listens on `GATEWAY_PORT`.
  - Nginx forwards `/g/:roomId` WebSockets there.

- **Chat service** (`apps/chat`):
  - Listens on `CHAT_PORT`.
  - Nginx forwards `/chat` WebSockets there.

- **Allocator** (`apps/allocator`):
  - Talks to Redis and game servers to create rooms and assign nodes.

- **Redis**:
  - Shared by matchmaking, allocator, game servers, scorer.

- **Scorer** (`apps/scorer`):
  - Depends on game servers and Redis.
  - Consumes match results and updates scores/MMR.

All these services see each other by hostname (`backend`, `matchmaking-service`, `game-server`, `game-gateway`, `redis`, etc.) over `prod-private`.

---

## 5. Online Pong traffic flow in deployment

Putting it all together, here’s the runtime path for online games in **prod**:

1. **User opens `/pong/online`**:
   - Browser → Nginx → static frontend files from `frontend_dist`.
   - React app bootstraps, mounts `<OnlineGame />`.

2. **Matchmaking WebSocket connection**:
   - Browser connects to `wss://your-domain/matchmaking`.
   - Nginx proxies to `matchmaking-service:${MATCHMAKING_PORT}` on `prod-private`.
   - Matchmaking authenticates, handles queueing, and eventually sends `HANDOFF`.

3. **Game room creation (control plane)**:
   - Matchmaking calls **Allocator** (HTTP) to allocate a room.
   - Allocator calls **Game Server** admin HTTP to `CreateRoom`.
   - Game Server registers the room in its `RoomRegistry`.
   - Allocator updates Redis mappings (`room-to-node:${roomId}`) pointing room → game node.

4. **Handoff and join token**:
   - Matchmaking sends `HANDOFF` to the client:
     - Contains `gameServerWSUrl`, `roomIdentifier`, `joinToken`, `randomSeed`, etc.

5. **Game WebSocket connection**:
   - Browser Pong host connects to `wss://your-domain/g/:roomId` with subprotocol:
     - `Sec-WebSocket-Protocol: bearer,<joinToken>`.
   - Nginx proxies to `game-gateway:${GATEWAY_PORT}`.
   - Gateway validates token (via `verifyJoinToken`), looks up `room-to-node:${roomId}` in Redis, and proxies the WS to the chosen `game-server` container.

6. **Game Node handling**:
   - Game Server’s `WSServer` verifies the token again (AuthService).
   - `RoomRegistry.attachPlayer` binds the socket to a `MatchSession`.
   - Once both players are connected, `MatchRunner` starts ticking.
   - Game Server sends frames and state updates back through the WS.

7. **Match end and persistence**:
   - On match end, Game Server:
     - Sends `MATCH_END` and summary to clients.
     - Reports result to backend/Scorer via HTTP/Redis.

8. **Resume**:
   - Game Server issues **resume tokens** and broadcasts them over the WS.
   - If the client disconnects, it can reconnect via:
     - `wss://your-domain/g/:roomId` with `Sec-WebSocket-Protocol: resume,<resumeToken>`.
   - Gateway and Game Server verify the resume token and reattach the player.

The **deployment config** ensures all of this works with:

- A **single public origin** (Nginx).
- **Private** internal network for game services (prod-private).
- Clear port mappings and health checks.

---

## 6. Tips for running and debugging locally

For development:

- Use `docker-compose.yml`:
  - Run `deps` once.
  - Start services you need (`frontend`, `backend`, `matchmaking-service`, `game-server`, `game-gateway`, `allocator`, `redis`, `chat-service`) plus `nginx` if you want single‑origin.
  - Access:
    - Frontend at `http://localhost:5173` or `http://localhost:8080`.
    - Backend at `http://localhost:3001`.
    - Matchmaking WS at `ws://localhost:8080/matchmaking` (via Nginx) or direct port depending on your setup.

- Use browser DevTools:
  - Network → WS to inspect `/matchmaking` and `/g/:roomId`.
  - Make sure the correct ports and paths are hit in dev (depending on Vite proxy/Nginx conf).

- Check container logs:
  - `docker compose logs matchmaking-service game-gateway game-server allocator redis scorer nginx`.
  - Matchmaking: queue/match logs.
  - Gateway: token validation / routing logs.
  - Game server: tick loop, reconnects, match end logs.

For prod:

- Use `docker-compose-prod.yml` (or its equivalent in your deployment platform).
- Ensure:
  - `.env` contains correct ports and secrets.
  - TLS certs are present in `./certs`.
  - Redis and game-server health checks pass before exposing Nginx.

---

## 7. Mental model to keep in mind

- **devnet** (dev): everything on one Docker network, direct ports exposed for easy debugging.
- **prod-private**: all internal real‑time services (matchmaking, game server, gateway, chat, allocator, redis, scorer).
- **prod-public**: only Nginx, which proxies requests/WebSockets to the private network.

Online Pong works because:

- Containers are wired by name on the private network.
- Redis and HTTP admin APIs link allocator ↔ game server ↔ gateway.
- Nginx ties everything into a single browser origin for the user.

With this, you should be able to read the compose files, reason about how containers interact, and know where to look when something is miswired.
