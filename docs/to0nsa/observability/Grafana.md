# Grafana – Dashboards and Visualization

This document explains how **Grafana** is used in ft_transcendence:

- What Grafana is and what data sources it uses.
- How it is provisioned and configured.
- How it is exposed via Nginx.

For which dashboards and panels matter for online Pong, see:

- `docs/to0nsa/workflow/MonitoringAndObservability.md`

---

## 1. What Grafana is (in this repo)

Grafana is a **dashboard and visualization tool**:

- Connects to data sources like Prometheus (metrics) and ElasticSearch (logs).
- Renders time‑series graphs, tables, and alerts dashboards.
- Allows building custom dashboards for:
  - Service health (backend, gateway, matchmaking, game servers).
  - Game‑specific metrics (matches per minute, node scores).
  - Infrastructure metrics (CPU, memory, container stats).

In ft_transcendence:

- Grafana reads from:
  - Prometheus – for metrics.
  - ElasticSearch – for stored logs (optional dashboards).

---

## 2. Grafana container and provisioning

**File:** `monitoring/docker-compose-base.yml`

```yaml
grafana:
  image: grafana/grafana
  restart: unless-stopped
  environment:
    - GF_SECURITY_ADMIN_USER=${GRAFANA_ADMIN_USER}
    - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASS}
    - GF_SERVER_ROOT_URL=http://localhost:${MONITORING_PORT:-8082}/grafana/
    - GF_SERVER_SERVE_FROM_SUB_PATH=true
    - GF_SECURITY_ALLOW_EMBEDDING=true
    - GF_SERVER_ENABLE_GZIP=true
    - GF_SERVER_ROUTER_LOGGING=true
    - GF_AUTH_GOOGLE_CLIENT_ID=${GRAFANA_OAUTH_CLIENT_ID}
    - GF_AUTH_GOOGLE_CLIENT_SECRET=${GRAFANA_OAUTH_CLIENT_SECRET}
    - GF_AUTH_GOOGLE_REDIRECT_URI=http://localhost:${GRAFANA_PORT:-3002}/grafana/login/google
    - GF_SERVER_DOMAIN=localhost
    - GF_SERVER_HTTP_PORT=${GRAFANA_PORT:-3002}
    - GF_SERVER_ENFORCE_DOMAIN=false
    - GF_SECURITY_COOKIE_SAMESITE=lax
  volumes:
    - grafana-storage:/var/lib/grafana
    - ./monitoring/grafana/grafana.ini:/etc/grafana/grafana.ini
    - ./monitoring/grafana/provisioning:/etc/grafana/provisioning
    - ./monitoring/grafana/dashboards/:/etc/grafana/dashboards
  healthcheck:
    test:
      [
        'CMD-SHELL',
        'curl -sf http://localhost:${GRAFANA_PORT:-3002}/api/health | grep -q ''"database": "ok"''',
      ]
  networks:
    - prod-private
    - prod-public
```

Key points:

- Admin credentials come from `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASS`.
- `GF_SERVER_ROOT_URL` and `GF_SERVER_SERVE_FROM_SUB_PATH=true`:
  - Grafana is served under `/grafana/` by Nginx, not at the root.
  - All URLs are generated relative to `/grafana/`.
- Provisioning:
  - `grafana.ini` – base config (branding, auth, etc.).
  - `provisioning/` – data sources and dashboards are automatically registered.
  - `dashboards/` – JSON dashboard definitions.
- Healthcheck:
  - Uses Grafana’s `/api/health` endpoint to ensure the DB is ready before proceeding.

There is also a `grafana-setup` container that:

- Waits for Grafana to be healthy.
- Configures users/roles via Grafana’s HTTP API using `GRAFANA_URL`, `ADMIN_USER`, `ADMIN_PASS`, and other envs.

---

## 3. Nginx exposure (`/grafana/`)

In `nginx/prod.conf.template`, Grafana is exposed by a dedicated **monitoring server**:

```nginx
server {
  listen ${MONITORING_PORT};
  server_name _;

  location = /grafana {
    return 301 /grafana/;
  }

  location /grafana/ {
    set $grafana_upstream http://grafana:${GRAFANA_PORT};
    proxy_pass $grafana_upstream;
    proxy_http_version 1.1;

    proxy_set_header Host               $host;
    proxy_set_header X-Real-IP          $remote_addr;
    proxy_set_header X-Forwarded-Proto  $scheme;
    proxy_set_header X-Forwarded-Host   $http_host;
    proxy_set_header X-Forwarded-Port   $server_port;
    proxy_set_header X-Forwarded-For    $proxy_add_x_forwarded_for;

    proxy_set_header Upgrade            $http_upgrade;
    proxy_set_header Connection         $connection_upgrade;

    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
    proxy_redirect off;
  }
}
```

Key behaviors:

- Listens on `${MONITORING_PORT}` (bound as `127.0.0.1:8082` on the host).
- HTTP calls:
  - `http://localhost:8082/grafana/` → Grafana UI.
  - Not exposed publicly; only accessible from the host.

This keeps Grafana **accessible to operators** but not exposed to end users on the main domain.

---

## 4. How Grafana is used day‑to‑day

Typical uses:

- **Operations:**
  - Overview dashboards for service health (backend, gateway, matchmaking, game server).
  - Panels for Redis, DB, and Nginx metrics.
  - Alerts view (via Alertmanager integration).

- **Game‑centric monitoring:**
  - Panels for:
    - Active matches per node.
    - Matchmaking queue lengths.
    - Game server node scores (from Scorer).
    - Error rates in critical APIs.

Dashboards are defined in:

- `monitoring/grafana/dashboards/*.json`

Provisioning ensures:

- Data sources (Prometheus, ElasticSearch) exist.
- Dashboards appear automatically on first run.

---

## 5. Summary

Grafana is the **human interface** for metrics and (optionally) logs:

- It reads from Prometheus and ElasticSearch.
- It is configured and provisioned automatically via Docker.
- It is safely exposed on a host‑only monitoring port.

When debugging online Pong issues, Grafana is typically the first place to look for spikes in errors, latency, queue sizes, or node load. For more on what to check, see `MonitoringAndObservability.md`.
