# Monitoring & Observability – Metrics, Logs, Dashboards

This document explains how **metrics and logs** flow through the ft_transcendence stack, and which signals matter most for the online Pong game.

It ties together:

- Service‑level metrics via `@utils/metrics` (Prometheus).
- Container/host metrics (cAdvisor).
- Nginx metrics (Prometheus exporter).
- Logs via the ELK stack (Logstash + Elasticsearch + Kibana).
- Nginx’s monitoring endpoints for Grafana and Kibana.

You can pair this with:

- `DeploymentOnlinePong.md` – how services and networks are wired in Docker.
- `AllocatorAndScorer.md` – how Scorer feeds node scores from Prometheus.
- `GatewayAndWebSockets.md` – where gateway metrics and logs are emitted.
- `GameNode.md` – what to look at when monitoring game‑server health and behavior.
- `docs/to0nsa/node/NodeAndFastify.md` – common logging and metrics patterns across Node services.
- `docs/to0nsa/nginx/NginxProdConfig.md` – how Nginx exposes stub status and monitoring UIs in production.
- `docs/to0nsa/docker/MonitoringStack.md` – how Prometheus, Grafana, and ELK run alongside the app in Docker.

---

## 1. Metrics: from services to Prometheus to Grafana

### 1.1 Service metrics (`@utils/metrics`)

Implementation: `packages/utils/metrics/src/index.ts`.

Most Node services (backend, matchmaking, allocator, game-server, scorer, chat, gateway) call:

```ts
import { registerMetrics } from '@utils/metrics';

registerMetrics(app, { labels: { service: 'matchmaking' } });
```

This:

- Registers `fastify-metrics` on the Fastify app.
- Exposes a **`/metrics` endpoint** with:
  - Default Prometheus metrics (CPU, memory, event loop lag, etc.).
  - Service‑level counters/gauges when you add them.
- Adds default labels:
  - `service` (e.g., `matchmaking`, `game-gateway`, `game-server`).
  - `env` (`NODE_ENV`).
  - `version` (`GIT_SHA`).

Prometheus can scrape each service’s `/metrics` endpoint on the **internal Docker network**.

### 1.2 Prometheus and Alertmanager

Config: `monitoring/docker-compose-base.yml` + `monitoring/prometheus-pre`.

Key services:

- `prometheus-pre`:
  - Builds a Prometheus config (`prometheus.yml`) and Alertmanager config based on env vars:
    - Ports for backend, game-gateway, matchmaking, scorer, chat, game-server, allocator.
  - Writes configs into volumes:
    - `prometheus-config:/etc/prometheus`
    - `alertmanager-config:/etc/alertmanager`

- `prometheus`:

```yaml
prometheus:
  image: prom/prometheus
  command:
    - '--config.file=/etc/prometheus/prometheus.yml'
    - '--storage.tsdb.retention.time=30d'
    - '--storage.tsdb.retention.size=1GB'
  volumes:
    - prometheus-config:/etc/prometheus:ro
  networks:
    - prod-private
```

Prometheus scrapes:

- Each Node service’s `/metrics` endpoint using internal DNS:
  - `http://backend:BACKEND_PORT/metrics`
  - `http://matchmaking-service:MATCHMAKING_PORT/metrics`
  - `http://game-server:GAME_SERVER_HTTP/metrics`, etc.
- Nginx metrics via the exporter (see below).
- Container metrics via cAdvisor.

`alertmanager`:

- Uses `alertmanager-config` to send alerts via email or webhooks based on Prometheus alert rules (configured by `prometheus-pre`).

### 1.3 Nginx metrics via exporter

In `nginx/prod.conf.template` there is a special **stub status** server:

```nginx
server {
  listen ${NGINX_STUB_STATUS_PORT};
  server_name _;

  access_log off;
  location /stub_status {
    stub_status;
    allow 172.16.0.0/12;
    allow 10.0.0.0/8;
    allow 192.168.0.0/16;
    deny all;
  }
}
```

Exporter: `monitoring/docker-compose-base.yml`:

```yaml
nginx-exporter:
  image: nginx/nginx-prometheus-exporter
  command:
    - '--nginx.scrape-uri=http://nginx:${NGINX_STUB_STATUS_PORT:-8081}/stub_status'
  networks:
    - prod-private
```

This exposes Nginx metrics in Prometheus format, including:

- Active connections.
- Accepted/handled requests.
- Reading/writing/waiting connections.

Prometheus scrapes `nginx-exporter`, not the Nginx stub directly.

### 1.4 Container and host metrics (cAdvisor)

`monitoring/docker-compose-base.yml`:

```yaml
cadvisor:
  image: gcr.io/cadvisor/cadvisor
  privileged: true
  command:
    - '--disable_metrics=cpu_topology,disk,network,memory,...'
    - '--docker_only=true'
    - '--housekeeping_interval=30s'
  volumes:
    - '/:/rootfs:ro'
    - '/var/run:/var/run:ro'
    - '/sys:/sys:ro'
    - '/sys/fs/cgroup:/sys/fs/cgroup:ro'
    - '/var/lib/docker/:/var/lib/docker:ro'
    - '/var/run/docker.sock:/var/run/docker.sock:ro'
  networks:
    - prod-private
```

cAdvisor exposes metrics about:

- Container CPU, memory, and FS usage.
- Number of running/stopped containers.

Prometheus scrapes cAdvisor as well.

### 1.5 Grafana dashboards

`monitoring/docker-compose-base.yml`:

```yaml
grafana:
  image: grafana/grafana
  environment:
    - GF_SECURITY_ADMIN_USER=${GRAFANA_ADMIN_USER}
    - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASS}
    - GF_SERVER_ROOT_URL=http://localhost:${MONITORING_PORT:-8082}/grafana/
    - GF_SERVER_SERVE_FROM_SUB_PATH=true
  volumes:
    - grafana-storage:/var/lib/grafana
    - ./monitoring/grafana/provisioning:/etc/grafana/provisioning
    - ./monitoring/grafana/dashboards/:/etc/grafana/dashboards
```

Nginx exposes Grafana on a **host‑only** port:

```nginx
server {
  listen ${MONITORING_PORT};
  location /grafana/ {
    set $grafana_upstream http://grafana:${GRAFANA_PORT};
    proxy_pass $grafana_upstream;
    # ... headers ...
  }
}
```

So from the host:

- Grafana: `http://localhost:8082/grafana/`
- Prometheus: port `9090` (dev) or internal only (prod).

Provisioned dashboards:

- Live under `monitoring/grafana/dashboards`.
- A setup container (`grafana-setup`) can configure users and folders automatically.

---

## 2. Logs: Docker → Logstash → Elasticsearch → Kibana

### 2.1 Pino + ECS logging in services

Logging utility: `packages/utils/logger/src/index.ts`.

For each Node service:

- `createFastifyLoggerConfig({ service: 'api' })` is used when creating Fastify instances.
- In dev:
  - Uses `pino-pretty` for colored, human‑readable logs.
- In prod:
  - Uses `@elastic/ecs-pino-format`:
    - Emits logs in **ECS (Elastic Common Schema)** JSON format.
    - Includes `service`, timestamp, log level, message, and context fields.

Example:

```ts
const app = fastify({
  logger: createFastifyLoggerConfig({ service: 'matchmaking' }),
});
```

These JSON logs go to **stdout** inside each container.

### 2.2 Docker logging driver and Logstash

`log-management/docker-compose-base.yml` describes the ELK stack:

- `elasticsearch` – stores logs and makes them searchable.
- `kibana` – web UI for exploring logs.
- `logstash` – collects logs and sends to Elasticsearch.

Logstash:

```yaml
logstash:
  build: ./log-management/logstash/
  ports:
    - '12201:12201/udp'
```

In `docker-compose.yml`, many services set:

```yaml
logging: &logstash-logging
  driver: gelf
  options:
    gelf-address: udp://localhost:12201
```

This means:

- Docker uses the **GELF logging driver**.
- It ships container logs (stdout) to `localhost:12201/udp`.
- That port is bound to `logstash`’s GELF input.

Logstash then:

- Parses GELF messages, including ECS JSON logs from services.
- Sends them to Elasticsearch with the appropriate index pattern.

### 2.3 Kibana for log exploration

`log-management/docker-compose-base.yml`:

```yaml
kibana:
  build: ./log-management/kibana/
  environment:
    - SERVER_BASEPATH=/kibana
    - SERVER_PUBLICBASEURL=http://localhost:${MONITORING_PORT:-8082}/kibana
```

Nginx exposes Kibana at:

- `http://localhost:8082/kibana/`

Workflow (see `log-management/README.md`):

1. Start dev stack with ELK (`make elk-detached`).
2. Hit the app to generate logs.
3. Open `localhost:5601` (or the Nginx proxied `localhost:8082/kibana`).
4. Log in as `elastic`.
5. Use **Discover** to inspect logs (filter by `service`, `level`, message, etc.).

Because logs are ECS‑formatted:

- You can build dashboards and alerts by service, correlation IDs, or error messages.

---

## 3. Nginx as a monitoring hub

In prod Nginx config (`nginx/prod.conf.template`), there is a dedicated **monitoring server block**:

```nginx
server {
  listen ${MONITORING_PORT};

  location /kibana/ {
    set $kibana_upstream http://kibana:${KIBANA_PORT};
    rewrite ^/kibana(/.*)$ $1 break;
    proxy_pass $kibana_upstream$request_uri;
    # ...
  }

  location /grafana/ {
    set $grafana_upstream http://grafana:${GRAFANA_PORT};
    proxy_pass $grafana_upstream;
    # ...
  }
}
```

This:

- Exposes **Grafana and Kibana** via one host‑only port (`MONITORING_PORT`) on `localhost`.
- Keeps monitoring UIs off the public interface.

Nginx also includes:

- Per‑endpoint **rate‑limit zones** (e.g., `api_limit`, `ws_connect_limit`) keyed by JWT or IP.
- This interacts with observability by:
  - Limiting abusive traffic that would otherwise pollute metrics/logs.
  - Giving clear logs when rate limits are hit.

---

## 4. Key metrics and dashboards for online Pong

When watching the system during online matches, these are the most important signals:

### 4.1 Matchmaking and allocator

From `matchmaking-service` and `allocator`:

- WebSocket connection counts.
- Queue length (if exported).
- Error counts:
  - `ERROR` messages with codes `AUTH`, `RATELIMIT`, `ALLOCATOR`.
- HTTP latency / error rate for `/allocate`.

From Redis:

- HLL/keys for `game-node:scores`.
- `room-to-node:*` mappings (used by gateway).

In Grafana:

- Dashboard showing:
  - Queue size over time.
  - Handoff success vs timeout rates.
  - Allocator `503` counts (“no available game nodes”).

### 4.2 Game servers (Game Nodes)

From `game-server` `/metrics`:

- `game_server_matches` – number of active matches.
- Event loop lag, CPU usage, memory usage.

From Scorer’s perspective (`apps/scorer`):

- Node “score” per game server, with breakdown:
  - CPU load.
  - FD usage.
  - Match load.

In Grafana:

- Node health dashboard:
  - matches per node.
  - normalized score.
  - container CPU/memory (via cAdvisor).

### 4.3 Gateway and Nginx

Gateway (`apps/game-gateway`):

- Count of successful and failed upgrades.
- Specific logs for:
  - `Unauthorized attempt` (bad join/resume tokens).
  - `Failed to route room` (bad `room-to-node` mapping or node down).

Nginx exporter:

- HTTP/WebSocket connection counts.
- Per‑location request success/error rates.

Dashboard ideas:

- WS connect success vs 4xx/5xx.
- Requests hitting rate limits.

### 4.4 Backend and chat

Backend:

- API latency and error rate for:
  - `/api/matches` and `/api/matches/:id/stats` (result persistence).
  - `/api/users/me` and `/api/users/me/stats` (profile/stats fetch).

Chat:

- WS connection counts.
- Channel sizes.
- Invite errors vs successes.

Kibana:

- Search logs for correlation:
  - Match ID or roomIdentifier.
  - User UUID.
  - Error codes (`AUTH`, `RATELIMIT`, etc.).

---

## 5. How to use this in practice

For development:

- Run dev stack + monitoring:
  - Use `docker-compose-dev.yml` in `monitoring/` and `log-management/`.
  - Check Prometheus at `localhost:9090`, Grafana at `localhost:8082/grafana`, Kibana at `localhost:8082/kibana`.
- Play a few online matches and:
  - Look at logs in Kibana filtered by `service:"matchmaking"` or `service:"game-server"`.
  - Inspect Grafana dashboards for spikes in queue length or node scores.

For debugging production issues:

- Start from **symptoms** (e.g., “players can’t join online matches”) and walk the pipeline:
  - Nginx → Gateway → Matchmaking → Allocator → Game Server.
  - Look for corresponding metrics and logs at each hop.
- Use **correlation IDs** when possible (roomIdentifier, matchId, user UUID) to tie logs together.

With this monitoring pipeline in place, you can:

- Detect problems early (via alerts).
- Understand how load is distributed and where bottlenecks are.
- Debug complex issues that span multiple services in the online Pong stack.
