# Nginx configuration guide for ft_transcendence

Below is a complete, line-by-line explanation of our Nginx configuration, tailored to how it’s used in our ft_transcendence project. I’ve included an overview first, then the annotated breakdown. I also reference how this file is wired up in our docker-compose to show the full picture.

## Overview
- Purpose: Provide a single-origin dev entry point so the app is reachable at http://localhost:8080 by default, while proxying:
  - `/api/` and `/uploads/` to the backend (Fastify on 3001)
  - Everything else (including Vite’s HMR) to the frontend (Vite dev server on 5173)
- Why Nginx here: Avoids CORS complexity in dev, standardizes headers passed to the backend, and properly supports WebSocket/HMR traffic.
- How it’s wired: In `docker-compose.yml`, the `nginx` service mounts this file into `/etc/nginx/conf.d/default.conf` and publishes host port `${NGINX_PORT:-8080}` to container port `80`. The service names `frontend` and `backend` become DNS-resolvable hostnames within the Docker network.

## Actual config as committed
```nginx
# /etc/nginx/conf.d/default.conf

resolver 127.0.0.11 ipv6=off valid=30s;

map $http_upgrade $connection_upgrade {
  default upgrade;
  ''      close;
}

server {
  listen 80;
  server_name _;

  client_max_body_size 20m;

  # ---------- API -> backend ----------
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

  # ---------- Static uploads via backend ----------
  location /uploads/ {
    set $be http://backend:3001;
    proxy_pass $be;
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
  }

  # ---------- Vite HMR WS ----------
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

  # ---------- Everything else -> Vite ----------
  location / {
    set $fe http://frontend:5173;
    proxy_pass $fe;
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;

    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
    proxy_buffering off;
  }
}
```

## Line-by-line explanation and why it’s used

- `# /etc/nginx/conf.d/default.conf` — Comment indicating where this file is mounted inside the container (via docker-compose bind mount).
- `resolver 127.0.0.11 ipv6=off valid=30s;` — Use Docker’s embedded DNS for resolving `frontend`/`backend`. IPv6 disabled for simplicity; cache results for 30s. Required because `proxy_pass` uses variables which need runtime DNS resolution.
- `map $http_upgrade $connection_upgrade { default upgrade; '' close; }` — Derives `$connection_upgrade` from the presence of `Upgrade` header. Standard for WebSocket support.
- `server {` — Starts the virtual host.
- `listen 80;` — Nginx listens inside the container on port 80; mapped to host `${NGINX_PORT:-8080}`.
- `server_name _;` — Catch-all server name for dev.
- `client_max_body_size 20m;` — Allow uploads up to ~20 MB; prevent 413 errors.

API block (`location /api/`):
- `set $be http://backend:3001;` — Target backend service in Docker network.
- `proxy_pass $be;` — Forward requests to backend with original path retained (including `/api/`).
- `proxy_http_version 1.1;` — Needed for keep-alive and WebSockets.
- `proxy_set_header Host $http_host;` — Preserve original Host header.
- `proxy_set_header X-Forwarded-Proto $scheme;` — Communicate original protocol.
- `proxy_set_header X-Forwarded-Host $http_host;` — Forwarded host for frameworks that rely on it.
- `proxy_set_header X-Forwarded-Port $server_port;` — Port seen by Nginx; helpful but not always required.
- `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` — Append client IP chain.
- `proxy_set_header Upgrade $http_upgrade;` and `Connection $connection_upgrade;` — WebSocket/SSE upgrade support.
- `proxy_read_timeout`/`proxy_send_timeout 300s;` — Generous timeouts for dev.

Uploads block (`location /uploads/`):
- Routes static uploads through the backend (where they’re stored/persisted via compose volumes).
- `proxy_set_header Host $http_host;` — Preserve host; other forwarded headers not strictly necessary here.

Vite HMR block (`location /@vite`):
- Routes HMR/WebSocket traffic to Vite dev server.
- Long timeouts and `proxy_buffering off;` to keep the connection live and reduce latency.

Catch-all (`location /`):
- Everything else goes to the Vite dev server.
- Timeouts + `proxy_buffering off;` help during development for responsiveness.

## How Nginx fits into docker-compose
- Service: `nginx`
  - `depends_on`: `frontend`, `backend` — ensures proxies target running services.
  - `ports`: `${NGINX_PORT:-8080}:80` — browse at `http://localhost:8080` by default.
  - `volumes`: `./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro` — mounts the config in the container.
- DNS: Docker’s embedded DNS (127.0.0.11) resolves `frontend` and `backend` on the `devnet` bridge.
- Upstreams: `backend:3001` (Fastify API + uploads), `frontend:5173` (Vite + HMR).

## Notes and tips
- If you change service names or ports in `docker-compose.yml`, update them here (`backend:3001`, `frontend:5173`).
- For larger uploads, increase `client_max_body_size` and ensure backend accepts the new limit.
- If generating absolute URLs on the backend, prefer using `X-Forwarded-Proto` and `X-Forwarded-Host`.
- Production will differ: typically add TLS, caching, stricter timeouts, health checks, and static asset serving from Nginx instead of proxying to Vite.

