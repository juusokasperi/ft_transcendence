# Logs & ELK – ElasticSearch, Logstash, Kibana

This document explains how the **ELK stack** is used in ft_transcendence to handle logs:

- What each component does (ElasticSearch, Logstash, Kibana).
- How container logs reach ElasticSearch.
- How Kibana is exposed.

For what to look at in logs when debugging online Pong, see:

- `docs/to0nsa/workflow/MonitoringAndObservability.md`

---

## 1. Components and roles

- **Logstash** – log ingestion:
  - Receives logs from containers using the GELF driver.
  - Parses JSON logs (especially ECS‑formatted logs from Fastify).
  - Sends structured events to ElasticSearch.

- **ElasticSearch** – log storage:
  - Stores log events with indexed fields (timestamp, service, level, message, etc.).
  - Supports full‑text search and aggregations.

- **Kibana** – log UI:
  - Provides search, filters, and visualization on top of ElasticSearch.
  - Used to inspect logs when debugging and to build log‑based dashboards.

All three are deployed via the monitoring Compose files under `monitoring/`.

---

## 2. Container logging via GELF

Compose files define a shared logging config:

```yaml
x-logstash-logging: &logstash-logging
  driver: gelf
  options:
    gelf-address: udp://localhost:12201
```

Each service that should log to ELK then uses:

```yaml
logging: *logstash-logging
```

This configuration:

- Tells Docker to send container logs over GELF (UDP) to Logstash.
- Applies to:
  - backend, matchmaking-service, game-server, game-server-2, game-gateway, allocator, scorer, chat-service, nginx, and others.

On the Node side:

- `@utils/logger` (Fastify and app loggers) uses ECS‑compatible JSON logging in prod:
  - Fields like `@timestamp`, `message`, `log.level`, `service.name`, etc.
  - Logstash can parse these into structured ElasticSearch documents.

---

## 3. ElasticSearch

ElasticSearch runs as part of the monitoring stack (see monitoring compose files). It:

- Listens for incoming data from Logstash.
- Stores logs in indices, typically one per time period (e.g., per day).
- Allows filters on:
  - service name (e.g., `service:matchmaking`).
  - level (`ERROR`, `WARN`, etc.).
  - fields from ECS (HTTP path, user ID, room ID, etc., if logged).

This makes it practical to:

- Jump to errors around a particular match ID, room ID, or user UUID.
- Correlate logs from multiple services for one match (matchmaking → allocator → game-server → backend).

---

## 4. Kibana exposure (`/kibana/`)

Kibana is exposed via Nginx’s monitoring server:

In `nginx/prod.conf.template`:

```nginx
server {
  listen ${MONITORING_PORT};
  server_name _;

  location = /kibana {
    return 301 /kibana/;
  }

  location /kibana/ {
    set $kibana_upstream http://kibana:${KIBANA_PORT};
    rewrite ^/kibana(/.*)$ $1 break;
    proxy_pass $kibana_upstream$request_uri;
    proxy_http_version 1.1;
    # X-Forwarded-* headers...
  }
}
```

Key behaviors:

- Listens on `${MONITORING_PORT}` (bound as `127.0.0.1:8082` on the host).
- Serves Kibana under `/kibana/`, with a redirect from `/kibana` → `/kibana/`.
- Not exposed on the public domain; only accessible from the host for operators.

URL:

- `http://localhost:8082/kibana/`

---

## 5. Day‑to‑day log usage

Typical workflows:

- **Debugging a specific error:**
  - Search for `log.level: ERROR` and filter by `service.name` (e.g., `game-server`).
  - Narrow down by time range when the issue occurred.
  - Use match IDs, room IDs, or user UUIDs (if logged) to follow a single match across services.

- **Monitoring trends:**
  - Build Kibana visualizations for error counts over time per service.
  - Combine with Prometheus metrics in Grafana for a full picture.

Because logs are structured and enriched with context, you can quickly answer questions like:

- “Which errors are happening most in matchmaking?”
- “Are allocator failures correlated with game‑server health issues?”
- “Which rooms are failing to start, and why?”

---

## 6. Summary

The ELK stack in this project:

- Collects **structured logs** from all key services via GELF.
- Stores them in ElasticSearch for efficient querying.
- Exposes them to developers/operators via Kibana under `/kibana/`.

Combined with Grafana and Prometheus, this gives you both the **metrics view** (rates, latencies, load) and the **log view** (exact errors, context) needed to debug and operate the online Pong stack.
