# Prod Docker Compose – `docker-compose-prod.yml`

This document explains how the **production Docker Compose file** (`docker-compose-prod.yml`) is structured:

- How services are built and configured.
- How networks separate public and private traffic.
- How healthchecks and restart policies are used.

It assumes you’ve read `Docker.md` for the overview.

---

## 1. Networks and shared volumes

Top of `docker-compose-prod.yml`:

```yaml
networks:
  prod-public:
    driver: bridge
  prod-private:
    driver: bridge
```

- `prod-public` – only Nginx is attached; exposes ports to the outside world.
- `prod-private` – internal services only (backend, game servers, matchmaking, Redis, etc.).

Named volumes (abbreviated):

- `frontend_dist` – built frontend assets for Nginx to serve.
- `redis_data` – Redis persistence.
- Prometheus/Grafana/ELK volumes for monitoring (in `monitoring` compose files).

---

## 2. Common environment and logging

Compose defines a set of common environment variables (`*prod-env`) and logging options (`*logstash-logging`):

- `*prod-env` (via YAML anchors) includes:
  - Node env (`NODE_ENV=production`).
  - Ports for game server HTTP/WS, matchmaking, gateway, etc.
  - URLs for Prometheus, backend, Redis.
- `*logstash-logging` is reused to send logs to Logstash via GELF:

  ```yaml
  logging: *logstash-logging
  ```

This keeps configuration consistent across all services.

---

## 3. Frontend build and Nginx gateway

### 3.1 Frontend builder

```yaml
frontend-builder:
  build:
    context: .
    dockerfile: ./node.template.dockerfile
    args:
      PNPM_VERSION: ${PNPM_VERSION:-9.12.3}
      SERVICE_NAME: frontend-builder
      SERVICE_DIR: frontend
  image: ft-transcendence-frontend-builder-prod:latest
  command: ['bash', '-lc', 'corepack pnpm install --frozen-lockfile && corepack pnpm build']
  volumes:
    - .:/work:cached
    - frontend_dist:/work/apps/frontend/dist
```

- Builds the frontend bundle into the `frontend_dist` volume.
- Nginx later serves files from this volume.

### 3.2 Nginx public gateway

```yaml
nginx:
  image: nginxinc/nginx-unprivileged:1.29-alpine
  restart: unless-stopped
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
    - KIBANA_PORT=${KIBANA_PORT:-5601}
    - GRAFANA_PORT=${GRAFANA_PORT:-3000}
    - NGINX_STUB_STATUS_PORT=${NGINX_STUB_STATUS_PORT:-8081}
    - MONITORING_PORT=${MONITORING_PORT:-8082}
  volumes:
    - ./nginx/prod.conf.template:/etc/nginx/templates/default.conf.template:ro
    - frontend_dist:/usr/share/nginx/html:ro
    - ./certs:/etc/nginx/certs:ro
  networks:
    - prod-public
    - prod-private
```

- Serves the SPA from `frontend_dist`.
- Proxies `/api/`, `/matchmaking`, `/g/`, `/chat`, `/uploads/` to internal services.
- Exposes monitoring UIs (Grafana/Kibana) on a host‑only port (`8082`).

See `docs/to0nsa/nginx/NginxProdConfig.md` for details.

---

## 4. Backend and Redis

### 4.1 Backend API

```yaml
backend:
  build:
    context: .
    dockerfile: ./node.template.dockerfile
    args:
      PNPM_VERSION: ${PNPM_VERSION:-9.12.3}
      SERVICE_NAME: backend
      SERVICE_DIR: backend
  image: ft-transcendence-backend-prod:latest
  init: true
  restart: unless-stopped
  env_file:
    - ./.env
  environment:
    <<: *prod-env
  networks:
    - prod-private
  logging: *logstash-logging
```

- Builds a dedicated backend image.
- Runs with `restart: unless-stopped`.
- Lives only on `prod-private`, reachable from Nginx and internal services.

### 4.2 Redis

```yaml
redis:
  image: redis:8.2.1-alpine
  restart: unless-stopped
  healthcheck:
    test: ['CMD', 'redis-cli', 'ping']
    interval: 5s
    retries: 100
  volumes:
    - redis_data:/data
  networks:
    - prod-private
```

- Shared across matchmaking, allocator, game servers, scorer, backend tournament bridge.
- Marked healthy via `redis-cli ping` healthcheck.

---

## 5. Online Pong services in prod

Each core service is built via the shared `node.template.dockerfile` with appropriate `SERVICE_NAME` and `SERVICE_DIR` arguments.

### 5.1 Matchmaking

```yaml
matchmaking-service:
  build:
    context: .
    dockerfile: ./node.template.dockerfile
    args:
      SERVICE_NAME: matchmaking
      SERVICE_DIR: matchmaking
  image: ft-transcendence-matchmaking-prod:latest
  init: true
  restart: unless-stopped
  env_file:
    - ./.env
  environment:
    <<: *prod-env
  networks:
    - prod-private
  depends_on:
    - allocator
```

### 5.2 Game servers

```yaml
game-server: &game-server-template
  build:
    context: .
    dockerfile: ./node.template.dockerfile
    args:
      SERVICE_NAME: game-server
      SERVICE_DIR: game-server
  image: ft-transcendence-game-server-prod:latest
  init: true
  restart: unless-stopped
  env_file:
    - ./.env
  environment:
    <<: *prod-env
  networks:
    - prod-private
  depends_on:
    redis:
      condition: service_healthy
  healthcheck:
    test: ["CMD-SHELL", "node -e \"fetch('http://localhost:${GAME_SERVER_HTTP:-55554}/health').then(res => { if (!res.ok) process.exit(1) } ).catch(err => process.exit(1))\""]
    interval: 5s
    timeout: 2s
    retries: 10
    start_period: 5s

game-server-2:
  <<: *game-server-template
```

- Two game server instances (`game-server`, `game-server-2`) for horizontal capacity.
- Healthcheck calls the game server’s HTTP `/health` endpoint.

### 5.3 Game gateway, chat, allocator, scorer

Each built similarly:

- `game-gateway` – WS gateway for `/g/:roomId`.
- `chat-service` – chat WS server.
- `allocator` – room allocator.
- `scorer` – node score calculator, depends on healthy game servers and Redis.

All:

- Use `env_file: .env` + `<<: *prod-env`.
- Run on `prod-private`.
- Use `restart: unless-stopped` and shared logging.

---

## 6. Monitoring stack (brief)

Monitoring services (Prometheus, Grafana, Elasticsearch, Logstash, Kibana) are defined in separate compose files under `monitoring/`:

- `monitoring/docker-compose-base.yml`
- `monitoring/prometheus-pre`

They attach to `prod-private` to scrape and collect:

- `/metrics` from Node/Fastify services.
- `/stub_status` from Nginx via `nginx-prometheus-exporter`.
- Docker/container metrics via cAdvisor.

For details, see `docs/to0nsa/workflow/MonitoringAndObservability.md`.

---

## 7. Summary

In production, Docker Compose:

- Builds a dedicated image for each service via a shared Node template.
- Uses two networks to separate public Nginx from private services.
- Adds healthchecks and `restart: unless-stopped` for robustness.
- Shares configuration via environment anchors and centralized logging.

Understanding `docker-compose-prod.yml` alongside the Nginx, Node, and Redis docs gives you a full picture of how the online Pong stack runs in a containerized production environment.
