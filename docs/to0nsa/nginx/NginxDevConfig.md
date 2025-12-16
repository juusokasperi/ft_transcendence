# Nginx Dev Config – `nginx/default.conf`

This document explains how the **dev Nginx config** (`nginx/default.conf`) routes traffic inside the Docker dev environment.

It assumes you’ve read `Nginx.md` for the high‑level overview.

---

## 1. Top‑level helpers

At the top of `default.conf`:

```nginx
resolver 127.0.0.11 ipv6=off valid=30s;

map $http_upgrade $connection_upgrade {
  default upgrade;
  ''      close;
}
```

- `resolver 127.0.0.11` – use Docker’s internal DNS resolver.
- `map $http_upgrade $connection_upgrade` – convenience mapping:
  - When `Upgrade` header is set (WebSocket handshake), use `Connection: upgrade`.
  - Otherwise use `Connection: close`.

Used later for WebSocket proxied locations.

---

## 2. Main server (dev)

The primary server:

```nginx
server {
  listen 80;
  server_name _;

  client_max_body_size 20m;
  # ... locations ...
}
```

Everything below runs on port 80 inside the dev container (mapped from the host in `docker-compose.yml`).

---

## 3. API and uploads

### 3.1 API → backend

```nginx
location /api/ {
  set $be http://backend:3001;
  proxy_pass $be;
  proxy_http_version 1.1;

  proxy_set_header Host               $http_host;
  proxy_set_header X-Forwarded-Proto  $scheme;
  proxy_set_header X-Forwarded-Host   $http_host;
  proxy_set_header X-Forwarded-Port   $server_port;
  proxy_set_header X-Forwarded-For    $proxy_add_x_forwarded_for;

  proxy_set_header Upgrade            $http_upgrade;
  proxy_set_header Connection         $connection_upgrade;

  proxy_read_timeout 300s;
  proxy_send_timeout 300s;
}
```

- For any path starting with `/api/`, Nginx:
  - Proxies to the backend Fastify server at `backend:3001`.
  - Preserves host and forwarding headers (useful for logs, CORS, redirects).
  - Forwards `Upgrade` and `Connection` headers if WebSockets are ever used under `/api/`.

### 3.2 Static uploads

```nginx
location /uploads/ {
  set $be http://backend:3001;
  proxy_pass $be;
  proxy_http_version 1.1;
  proxy_set_header Host $http_host;
}
```

- Proxies `/uploads/...` directly to the backend’s static file handler.

---

## 4. Frontend – Vite dev server

### 4.1 Vite HMR WebSocket

```nginx
location /@vite {
  set $fe http://frontend:5173;
  proxy_pass $fe;
  proxy_http_version 1.1;

  proxy_set_header Upgrade    $http_upgrade;
  proxy_set_header Connection $connection_upgrade;
  proxy_set_header Host       $http_host;

  proxy_read_timeout 1d;
  proxy_send_timeout 1d;
  proxy_buffering off;
}
```

- Proxies Vite’s hot‑module‑reload WS endpoint `/@vite` to the frontend dev server.
- Long timeouts and buffering disabled to keep HMR stable.

### 4.2 All other frontend routes

```nginx
location / {
  set $fe http://frontend:5173;
  proxy_pass $fe;
  proxy_http_version 1.1;
  proxy_set_header Host $http_host;
  proxy_set_header Upgrade    $http_upgrade;
  proxy_set_header Connection $connection_upgrade;

  proxy_read_timeout 300s;
  proxy_send_timeout 300s;
  proxy_buffering off;
}
```

- For everything else (except other explicit locations), route to Vite dev server.
- Vite does the SPA routing (serves `index.html` for React routes).

---

## 5. WebSockets – game gateway, matchmaking, game server, chat

### 5.1 Game gateway (`/g/`)

```nginx
location /g/ {
  set $gw http://game-gateway:55550;
  proxy_pass $gw;
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

- Handles WebSocket upgrades for `/g/:roomId` and proxies them to the game gateway service.

### 5.2 Matchmaking (`/matchmaking`)

```nginx
location /matchmaking {
  set $mm http://matchmaking-service:4242;
  proxy_pass $mm;
  proxy_http_version 1.1;

  proxy_set_header Host               $http_host;
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

- Routes matchmaking WS connections to the matchmaking service container.

### 5.3 Game server HTTP (`/game-server`)

```nginx
location /game-server {
  set $gs http://game-server:55553;
  proxy_pass $gs;
  proxy_http_version 1.1;
  // headers...
}
```

- Used mainly for testing or internal calls; not central to normal browser flows.

### 5.4 Chat (`/chat`)

```nginx
location /chat {
  proxy_pass http://chat-service:6262;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection $connection_upgrade;
  proxy_set_header Host $host;

  proxy_read_timeout 3600s;
  proxy_send_timeout 3600s;

  proxy_buffering off;
}
```

- Proxies `/chat` WebSocket connections to the chat service.

---

## 6. Nginx metrics for dev

At the bottom:

```nginx
server {
  listen 8081;
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

- Exposes `/stub_status` for internal metrics (active connections, etc.).
- Access is restricted to internal Docker networks.
- The `nginx-prometheus-exporter` container scrapes this URL and re‑exports metrics for Prometheus.

---

## 7. Summary

In dev, Nginx’s main jobs are:

- Route HTTP and WebSocket requests to the correct Docker containers (`frontend`, `backend`, `matchmaking-service`, `game-gateway`, `chat-service`, `game-server`).
- Provide a single origin for testing the integrated system.
- Expose Nginx metrics for the monitoring stack.
