# Monitoring Stack and Docker

This document explains how Docker Compose is used to run the **monitoring stack** for ft_transcendence:

- Prometheus (metrics)
- Grafana (dashboards)
- ElasticSearch + Logstash + Kibana (logs)
- cAdvisor and Nginx exporter (container and proxy metrics)

It complements:

- `docs/to0nsa/workflow/MonitoringAndObservability.md`
- `ProdCompose.md`

---

## 1. Monitoring compose files

Monitoring services live under the `monitoring/` directory:

- `monitoring/docker-compose-base.yml`
- `monitoring/prometheus-pre` (setup container for Prometheus config)
- `monitoring/grafana/*` (dashboards and provisioning)

These compose files are typically run alongside the main prod stack, attaching to the same `prod-private` network so they can reach internal services.

---

## 2. Prometheus and Alertmanager

### 2.1 Config generation (`prometheus-pre`)

`prometheus-pre` is a small container that:

- Reads environment variables for:
  - Backend, matchmaking, scorer, gateway, game server ports.
  - Nginx stub status port.
  - Alerting destinations.
- Generates:
  - `prometheus.yml` – scrape config for services.
  - `alertmanager.yml` – alerting rules.
- Writes them into volumes:
  - `prometheus-config:/etc/prometheus`
  - `alertmanager-config:/etc/alertmanager`

### 2.2 Prometheus service

In `monitoring/docker-compose-base.yml`:

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

- Node/Fastify services at `/metrics`:
  - `backend`, `matchmaking-service`, `game-server`, `game-gateway`, `allocator`, `scorer`, `chat-service`.
- Nginx exporter (see below).
- cAdvisor for container metrics.

Alertmanager sits alongside Prometheus, using the config from `alertmanager-config`.

---

## 3. Grafana

Grafana is defined in `monitoring/docker-compose-base.yml`:

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
  networks:
    - prod-private
```

Key points:

- Uses pre‑provisioned dashboards and data sources from `monitoring/grafana`.
- Root URL and path are configured so Grafana is served under `/grafana/` behind Nginx.

Nginx (`prod.conf.template`) exposes Grafana via the monitoring server:

- `http://localhost:${MONITORING_PORT}/grafana/` (host‑only).

---

## 4. ElasticSearch, Logstash, and Kibana (ELK)

### 4.1 Logging pipeline

Services in both dev and prod use the `gelf` log driver:

```yaml
logging: &logstash-logging
  driver: gelf
  options:
    gelf-address: udp://localhost:12201
```

Logstash listens on this GELF port and forwards logs to ElasticSearch:

- `matchmaking-service`, `backend`, `game-server`, `game-gateway`, `allocator`, `scorer`, `chat-service`, and `nginx` all use `logging: *logstash-logging`.

Fastify loggers produce ECS‑friendly JSON (via `@utils/logger`), which Logstash parses into structured fields.

### 4.2 Kibana

Kibana is exposed through Nginx’s monitoring server:

- `http://localhost:${MONITORING_PORT}/kibana/`

This allows browsing logs and building visualizations without exposing Kibana publicly.

---

## 5. cAdvisor and Nginx exporter

### 5.1 cAdvisor

Configured in `monitoring/docker-compose-base.yml`:

```yaml
cadvisor:
  image: gcr.io/cadvisor/cadvisor
  privileged: true
  command:
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

Provides container‑level metrics (CPU, memory, filesystem) for Prometheus.

### 5.2 Nginx Prometheus exporter

```yaml
nginx-exporter:
  image: nginx/nginx-prometheus-exporter
  command:
    - '--nginx.scrape-uri=http://nginx:${NGINX_STUB_STATUS_PORT:-8081}/stub_status'
  networks:
    - prod-private
```

- Scrapes Nginx’s `/stub_status` endpoint.
- Re‑exports metrics in Prometheus format for Prometheus to scrape.

---

## 6. How it all fits together

- Docker Compose spins up:
  - Application services (backend, matchmaking, game servers, etc.) on `prod-private`.
  - Nginx as the public entrypoint on both `prod-public` and `prod-private`.
  - Monitoring services on `prod-private`.
- Monitoring stack:
  - Prometheus scrapes metrics from app services, Nginx exporter, and cAdvisor.
  - Grafana reads from Prometheus and ElasticSearch to present dashboards.
  - Logstash ingests container logs (via GELF) and writes to ElasticSearch.
  - Kibana provides log search and visualization.

This gives a full observability suite running alongside the app, wired together entirely via Docker networks and Compose.

