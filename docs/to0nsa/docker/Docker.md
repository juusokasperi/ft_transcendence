# Docker in ft_transcendence – Overview

This document is a high‑level course on **how Docker and Docker Compose are used** in this project:

- What Docker brings to this stack.
- How dev and prod Compose files are structured.
- How services, networks, and volumes are organized.

For detailed breakdowns, see:

- `DevCompose.md` – `docker-compose.yml` (dev).
- `ProdCompose.md` – `docker-compose-prod.yml` (prod).
- `MonitoringStack.md` – monitoring‑related Compose details.

---

## 1. Why Docker is used here

Docker solves several problems at once for this app:

- **Reproducible environments:**
  - All Node services run inside containers with a fixed Node version (`node:22`), consistent dependencies, and shared configuration.
- **Multi‑service orchestration:**
  - The app is a micro‑stack: frontend, backend, matchmaking, game server(s), game gateway, chat, allocator, scorer, Redis, Nginx, and monitoring services.
  - Docker Compose defines how these services start, depend on each other, and communicate.
- **Single‑origin dev and prod:**
  - Nginx sits in front, serving the SPA and proxying to internal services, mirroring the prod setup in dev.
- **Easy local development and prod‑like testing:**
  - `docker-compose.yml` gives you a one‑command dev stack.
  - `docker-compose-prod.yml` shows how the prod environment is wired, including healthchecks, restart policies, and optimized images.

---

## 2. High‑level Compose structure

There are two main Compose files:

- `docker-compose.yml` – dev stack:
  - Uses `node:22-bookworm` images for Node services.
  - Mounts the repo into containers and runs `pnpm dev`.
  - Provides a `deps` service that installs dependencies once and seeds `node_modules` volumes.
  - Includes dev Nginx, Redis, and core services (frontend, backend, matchmaking, game-server, game-gateway, chat, allocator, scorer).

- `docker-compose-prod.yml` – prod stack:
  - Builds dedicated images for each Node service using `node.template.dockerfile`.
  - Uses `nginxinc/nginx-unprivileged` for the public gateway.
  - Separates public and private networks (`prod-public`, `prod-private`).
  - Adds healthchecks, `restart: unless-stopped`, and logging configuration.

Both files:

- Define named volumes for:
  - PNPM store (`pnpm-store`).
  - Service‑specific `node_modules` directories in dev.
  - SQLite data and uploads for the backend.
  - Frontend build output (`frontend_dist`) in prod.
  - Redis data (`redis_data`).
- Use Docker networks to keep internal traffic isolated from the host.

---

## 3. Service ecosystem in containers

Across dev and prod, the same logical services exist:

- **frontend** – React + Vite app (dev server in dev, static build in prod).
- **backend** – Fastify API + SQLite.
- **matchmaking-service** – WS server for `/matchmaking`.
- **game-server** (and `game-server-2` in prod) – server‑authoritative Pong nodes.
- **game-gateway** – WS gateway for `/g/:roomId`.
- **chat-service** – WS server for `/chat`.
- **allocator** – HTTP service for room allocation and join token minting.
- **scorer** – background service computing node scores from Prometheus metrics.
- **redis** – shared in‑memory store for tokens, room routing, scores, and tournament events.
- **nginx** – reverse proxy and static file server.

In prod, additional monitoring stack services are added (Prometheus, Grafana, Elastic/Logstash/Kibana) via the `monitoring` compose files.

---

## 4. Logging and metrics integration

Compose files use a shared logging configuration:

```yaml
x-logstash-logging: &logstash-logging
  driver: gelf
  options:
    gelf-address: udp://localhost:12201
```

Then for services:

```yaml
logging: *logstash-logging
```

- Sends container logs to Logstash over GELF.
- Integrates with the ELK stack described in `docs/to0nsa/workflow/MonitoringAndObservability.md`.

Metrics:

- Each Node service exposes `/metrics` via `@utils/metrics`.
- Prometheus scrapes these endpoints plus Nginx’s stub status and cAdvisor.

---

## 5. How to read the detailed Docker docs

If you want to understand Docker usage in this repo:

- Start with `DevCompose.md` to see how to run everything locally.
- Then read `ProdCompose.md` to understand the production layout, healthchecks, and image builds.
- Use `MonitoringStack.md` to see how Prometheus, Grafana, and ELK are wired.

These docs, together with the Nginx, Node, and Redis docs, give you a complete infrastructure picture for ft_transcendence.
