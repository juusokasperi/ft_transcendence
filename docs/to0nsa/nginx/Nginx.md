# Nginx in ft_transcendence – Overview

This document is a high‑level course on **how Nginx is used in this project**:

- What Nginx is and why it sits in front of the app.
- How it routes HTTP and WebSocket traffic to the correct services.
- How it participates in rate limiting and monitoring.

For concrete configs, see:

- `NginxDevConfig.md` – `nginx/default.conf` (dev).
- `NginxProdConfig.md` – `nginx/prod.conf.template` (prod).

---

## 1. What Nginx is (in this repo)

Nginx is a **high‑performance HTTP and reverse proxy server**. In ft_transcendence it is used as:

- The **single external entrypoint** in production:
  - Terminates HTTP (and TLS, when certs are configured).
  - Serves the static frontend build.
  - Proxies API calls and WebSocket connections to backend services.
- A **dev helper** in Docker:
  - Provides a single origin for frontend + backend + WS in local Docker dev.
  - Proxies to the Vite dev server, backend API, matchmaking, chat, gateway, etc.
- A **traffic control point**:
  - Enforces basic request and connection rate limits (especially for auth and WS connect).
  - Exposes Nginx stub status for Prometheus metrics via an exporter.

Nginx does **not** run your application code (React, Node, game logic). It just routes requests and applies cross‑cutting concerns like rate limiting and static file serving.

---

## 2. Why Nginx is used here

Reasons Nginx fits this stack:

- **Single origin for browser security:**
  - Browser can talk to `https://your-domain` for:
    - SPA assets (the React app).
    - Backend API calls (`/api/...`).
    - WebSocket endpoints (`/matchmaking`, `/g/:roomId`, `/chat`).
  - Avoids CORS headaches and simplifies cookie handling.

- **Efficient reverse proxy for many services:**
  - Routes based on path prefixes:
    - `/api/` → backend API (`apps/backend`).
    - `/matchmaking` → matchmaking service (`apps/matchmaking`).
    - `/g/` → game gateway (`apps/game-gateway`).
    - `/chat` → chat service (`apps/chat`).
    - `/uploads/` → backend static uploads.
  - Handles WebSocket upgrades correctly (headers, timeouts).

- **Rate limiting and protection:**
  - Uses `limit_req_zone` and `limit_req` to constrain:
    - API request rates.
    - Auth endpoint rates (login/signup/reset).
    - WebSocket connection attempts.

- **Observability:**
  - Exposes `/stub_status` for Nginx metrics (via `nginx-prometheus-exporter`).
  - Exposes Grafana and Kibana under a single monitoring port in prod.

Using Nginx for these concerns keeps the Node/Fastify services simpler: they focus on application logic, while Nginx handles front‑door routing and basic safeguards.

---

## 3. Dev vs prod roles

Nginx behaves slightly differently in dev and prod:

- **Dev (`nginx/default.conf`):**
  - Routes `/` and `/@vite` to the Vite dev server (`frontend:5173`).
  - Proxies `/api/` to the backend (`backend:3001`).
  - Proxies WebSocket endpoints directly to the dev containers:
    - `/matchmaking` → `matchmaking-service:4242`
    - `/g/` → `game-gateway:55550`
    - `/chat` → `chat-service:6262`
  - Mainly used inside Docker dev to test everything through one origin.

- **Prod (`nginx/prod.conf.template`):**
  - Serves the **built frontend bundle** from `/usr/share/nginx/html`.
  - Proxies `/api/`, `/matchmaking`, `/g/`, `/chat`, `/uploads/` to the respective internal services, using environment variables for ports.
  - Applies **rate limiting zones** per cookie token or IP.
  - Hosts monitoring UIs (`/grafana/`, `/kibana/`) on a dedicated monitoring port.

The next docs break down each config in more detail.
