# Nginx Prod Config – `nginx/prod.conf.template`

This document explains the **production Nginx config template** used in `docker-compose-prod.yml`:

- How it routes requests to backend services.
- How rate limiting is configured.
- How monitoring UIs (Grafana/Kibana) are exposed.

It assumes you’ve read `Nginx.md` for the overview.

---

## 1. Top‑level maps and rate limit zones

At the top of `prod.conf.template`:

```nginx
resolver 127.0.0.11 ipv6=off valid=30s;

map $http_upgrade $connection_upgrade {
  default upgrade;
  ''      close;
}

map $cookie_token $jwt_token {
  default $cookie_token;
  ''      close;
}

map $jwt_token $rate_limit_key {
  'anonymous' $binary_remote_addr;
  default     $jwt_token;
}
```

- `resolver` and `connection_upgrade` – same as dev.
- `map $cookie_token $jwt_token` – extracts the `token` cookie into `$jwt_token`.
- `map $jwt_token $rate_limit_key` – picks a rate‑limit key:
  - If a JWT token is present → use it (per user).
  - Otherwise → use client IP (`$binary_remote_addr`).

Rate limit zones:

```nginx
limit_req_zone $rate_limit_key zone=api_limit:10m rate=20r/s;
limit_req_zone $rate_limit_key zone=auth_limit:10m rate=10r/s;
limit_req_zone $rate_limit_key zone=upload_limit:10m rate=5r/s;
limit_req_zone $rate_limit_key zone=ws_connect_limit:10m rate=5r/s;
```

- `api_limit` – general API requests (20 req/s).
- `auth_limit` – login/signup/auth/reset (10 req/s).
- `upload_limit` – avatar uploads (5 req/s).
- `ws_connect_limit` – WebSocket connection attempts (5 req/s).

These zones are applied in specific `location` blocks using `limit_req`.

---

## 2. Main public server

The main public server:

```nginx
server {
  listen 80;
  listen 443 ssl http2;
  server_name _;
  # SSL certs configured via mounted certs, not shown here.
  # ... locations ...
}
```

In the compose file, this is bound to host ports `${NGINX_PORT}` and `${NGINX_HTTPS_PORT}`.

---

## 3. API proxying and rate limiting

### 3.1 General API (`/api/`)

```nginx
location /api/ {
  limit_req zone=api_limit burst=20 nodelay;

  proxy_pass http://backend:${BACKEND_PORT};
  proxy_http_version 1.1;
  # X-Forwarded-* headers...
}
```

- Applies `api_limit` rate limiting.
- Proxies to backend Fastify API based on `BACKEND_PORT`.

### 3.2 Auth endpoints

```nginx
location ~ ^/api/(login|signup|auth|reset-password) {
  limit_req zone=auth_limit burst=10 nodelay;

  proxy_pass http://backend:${BACKEND_PORT};
  proxy_http_version 1.1;
  # headers...
}
```

- Stricter `auth_limit` for sensitive endpoints:
  - Protects against brute‑force login attempts.
  - Limits signup and password reset abuse.

### 3.3 Uploads

```nginx
location /uploads/ {
  limit_req zone=upload_limit burst=5 nodelay;
  proxy_pass http://backend:${BACKEND_PORT};
  proxy_http_version 1.1;
  proxy_set_header Host $http_host;
}
```

- Uses `upload_limit` to avoid overwhelming the backend with large file uploads.

---

## 4. WebSocket endpoints

Each WebSocket entrypoint has a similar pattern: apply `ws_connect_limit`, proxy to the correct internal service, and set WS headers/timeouts.

### 4.1 Game gateway (`/g/`)

```nginx
location /g/ {
  limit_req zone=ws_connect_limit burst=5 nodelay;

  proxy_pass http://game-gateway:${GATEWAY_PORT};
  proxy_http_version 1.1;

  proxy_set_header Host               $host;
  proxy_set_header X-Forwarded-Proto  $scheme;
  proxy_set_header X-Forwarded-Host   $http_host;
  proxy_set_header X-Forwarded-Port   $server_port;
  proxy_set_header X-Forwarded-For    $proxy_add_x_forwarded_for;

  proxy_set_header Upgrade            $http_upgrade;
  proxy_set_header Connection         $connection_upgrade;

  proxy_read_timeout 300s;
  proxy_send_timeout 300s;

  proxy_buffering off;
}
```

- Enforces a limit on how often a client can attempt to connect to `/g/:roomId`.

### 4.2 Matchmaking (`/matchmaking`)

```nginx
location /matchmaking {
  limit_req zone=ws_connect_limit burst=5 nodelay;

  proxy_pass http://matchmaking-service:${MATCHMAKING_PORT};
  proxy_http_version 1.1;
  # similar headers and timeouts...
}
```

- Same `ws_connect_limit` zone applied to matchmaking connections.

### 4.3 Chat (`/chat`)

```nginx
location /chat {
  limit_req zone=ws_connect_limit burst=5 nodelay;

  proxy_pass http://chat-service:${CHAT_PORT};
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection $connection_upgrade;
  proxy_set_header Host $host;

  proxy_read_timeout 3600s;
  proxy_send_timeout 3600s;

  proxy_buffering off;
}
```

- Same `ws_connect_limit` applies to chat WS connections.

---

## 5. Static frontend (SPA)

At the bottom of the main server block:

```nginx
location / {
  root /usr/share/nginx/html;
  index index.html;
  try_files $uri /index.html;
}
```

- Serves the built SPA from the `frontend_dist` volume (mounted at `/usr/share/nginx/html`).
- Uses `try_files` so that unknown paths fall back to `index.html`, allowing React Router to handle them client‑side.

This is the main difference vs dev:

- In dev, `/` proxies to Vite.
- In prod, `/` serves static assets built by the frontend builder container.

---

## 6. Nginx metrics and monitoring UIs

### 6.1 Stub status for Prometheus

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

- Exposes an internal `/stub_status` endpoint.
- Only accessible from internal Docker subnets.
- Scraped by `nginx-prometheus-exporter` and then by Prometheus.

### 6.2 Monitoring server (Grafana & Kibana)

```nginx
server {
  listen ${MONITORING_PORT};
  server_name _;

  location = /kibana { return 301 /kibana/; }
  location /kibana/ { /* proxy to kibana:${KIBANA_PORT} */ }

  location = /grafana { return 301 /grafana/; }
  location /grafana/ { /* proxy to grafana:${GRAFANA_PORT} */ }
}
```

- Listens on a host‑only port (e.g., `127.0.0.1:8082`).
- Proxies `/grafana/` to Grafana and `/kibana/` to Kibana.
- Makes it easy to access monitoring UIs from the host without exposing them publicly.

---

## 7. Summary

In production, Nginx:

- Serves the built frontend SPA.
- Proxies API and WebSocket traffic to the correct internal services, using env‑configured ports.
- Enforces simple but important rate limits for APIs, auth endpoints, uploads, and WS connections.
- Exposes Nginx metrics for Prometheus and monitoring UIs (Grafana/Kibana) on a dedicated port.

This keeps the public surface area small and well‑controlled, while the internal Node/Fastify services focus on application logic.

