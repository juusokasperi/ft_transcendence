# Metrics Collectors – cAdvisor, Nginx Exporter, and In‑App Metrics

This document explains the **metrics collection layer** in ft_transcendence:

- cAdvisor for container/host metrics.
- Nginx Prometheus exporter for Nginx metrics.
- In‑process metrics from Node/Fastify services (`@utils/metrics`).

These feed into Prometheus; see also:

- `PrometheusAndAlertmanager.md`
- `docs/to0nsa/workflow/MonitoringAndObservability.md`

---

## 1. In‑app metrics (`@utils/metrics`)

Most Node/Fastify services call:

```ts
import { registerMetrics } from '@utils/metrics';

registerMetrics(app, { labels: { service: 'matchmaking' } });
```

This:

- Registers `fastify-metrics` on the Fastify instance.
- Exposes a `/metrics` endpoint with:
  - Default metrics:
    - process CPU and memory.
    - event loop lag.
    - HTTP request counts and latencies.
  - Service‑level metrics when added (e.g., custom counters/gauges).
- Attaches default labels:
  - `service` – e.g., `api`, `matchmaking`, `game-gateway`, `game-server`, `allocator`, `scorer`, `chat`.
  - `env` – environment (dev/prod).
  - `version` – git SHA or version where configured.

Prometheus scrapes these `/metrics` endpoints on the internal Docker network.

In practice:

- These metrics are the basis for most dashboards and alerts:
  - HTTP 5xx rates.
  - Latencies for API endpoints.
  - WebSocket connection counts (when instrumented).
  - Game server match counts (via custom metrics).

---

## 2. cAdvisor – container and host metrics

**File:** `monitoring/docker-compose-base.yml`

```yaml
cadvisor:
  image: gcr.io/cadvisor/cadvisor
  restart: unless-stopped
  privileged: true
  command:
    - '--disable_metrics=cpu_topology,disk,network,memory,memory_numa,tcp,udp,percpu,sched,process,hugetlb,referenced_memory,resctrl,cpuset,advtcp'
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

cAdvisor:

- Discovers running Docker containers.
- Exposes a `/metrics` endpoint with:
  - Container CPU usage.
  - Memory usage and limits.
  - Filesystem usage.
  - Some host‑level metrics (depending on privileges).

Why it’s used:

- Provides **infrastructure metrics** beyond what app metrics expose.
- Lets you answer questions like:
  - “Is game‑server CPU saturated?”
  - “Is Redis memory close to its limit?”
  - “Are containers being OOM‑killed?”

Prometheus scrapes cAdvisor’s `/metrics` alongside app metrics.

---

## 3. Nginx Prometheus exporter

**File:** `monitoring/docker-compose-base.yml`

```yaml
nginx-exporter:
  image: nginx/nginx-prometheus-exporter
  restart: unless-stopped
  depends_on:
    nginx:
      condition: service_started
  command:
    - '--nginx.scrape-uri=http://nginx:${NGINX_STUB_STATUS_PORT:-8081}/stub_status'
  networks:
    - prod-private
```

Nginx itself does not expose Prometheus metrics directly; instead:

- `/stub_status` is configured in Nginx (`nginx/prod.conf.template`).
- `nginx-exporter` scrapes `/stub_status` and re‑exports metrics in Prometheus format.

Metrics include:

- Active connections.
- Accepted/handled requests.
- Reading/writing/waiting connections.

Why it matters:

- Provides a **front‑door view** of traffic:
  - Total requests/second.
  - Breakdown of active connections.
  - Potential backpressure at the proxy layer.

Prometheus scrapes `nginx-exporter` like any other metrics endpoint.

---

## 4. Putting it together

The metrics collection layer consists of:

- **In‑app metrics** (`/metrics` on each Node service):
  - Business and service metrics with `service` labels.
- **cAdvisor**:
  - Container and host resource usage.
- **Nginx exporter**:
  - Proxy/edge traffic metrics.

Prometheus scrapes all three and stores the data; Grafana consumes it for dashboards; Alertmanager uses it for alerts.

This layered approach lets you correlate:

- Application issues (e.g., spikes in 5xx from matchmaking).
- Infrastructure constraints (e.g., CPU/memory pressure).
- Front‑door behavior (e.g., surges in WS connections or API requests).
