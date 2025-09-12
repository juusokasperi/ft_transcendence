# Docker Compose (Development) — Detailed Documentation

This document explains how the development docker-compose.yml at the repository root works. It describes the purpose of the setup, then goes through each service line by line, explaining what each directive does and why it’s configured this way. It then covers why we use Node base images directly (without custom Dockerfiles) in development and finishes with the typical differences you should expect in a production docker-compose.yml.

## What this Compose configuration does

This configuration spins up a complete development environment with:

- A one-off dependency installer service (deps) that installs pnpm dependencies for the monorepo and builds shared TypeScript libraries once.
- A frontend service running Vite in dev mode with HMR.
- A backend service running Fastify in watch mode (tsx), including automatic DB migrations and static file serving for uploads.
- An nginx reverse proxy that consolidates everything under a single origin, forwarding /api and /uploads to the backend and everything else to the frontend.
- Shared, named volumes for pnpm store and per-workspace node_modules, so dependency installation is fast and persistent across container restarts.
- A single bridged network (devnet) for inter-service communication.

The result is a fast, reproducible, single-origin development setup using containers, without the need to rebuild images every time code changes.

---

## Global configuration (name, volumes, networks)

Source excerpt:

```yml
name: ft-transcendence-dev

volumes:
  pnpm-store: {}
  node_modules: {}
  frontend_node_modules: {}
  backend_node_modules: {}
  render_node_modules: {}

networks:
  devnet:
    driver: bridge
```

- name: ft-transcendence-dev
  - Sets the project name. Docker Compose uses this to namespace container, network, and volume names, keeping them grouped and avoiding conflicts with other projects.

- volumes:
  - pnpm-store: Persist pnpm’s content-addressable store. This makes installs much faster as dependencies are cached.
  - node_modules: A named volume for the root node_modules directory (though we generally don’t install into root in a strict workspace layout, some tools may leverage it).
  - frontend_node_modules, backend_node_modules, render_node_modules: Per-workspace node_modules volumes. These allow each workspace to cache its installed dependencies independently and persist across container rebuilds.

- networks:
  - devnet: A dedicated bridge network so services can resolve each other by name (e.g. backend, frontend, nginx). Bridge is the default and simplest for local dev.

---

## Service: deps (dependency bootstrapper)

Source excerpt:

```
# 1) Install deps ONCE for the whole repo (root lockfile)
deps:
  image: node:22-bookworm
  working_dir: /work
  environment:
    PNPM_STORE_DIR: /pnpm/store
    TMPDIR: /tmp
    COREPACK_ENABLE_DOWNLOAD_PROMPT: "0"
  command: >
    bash -lc "
      corepack enable &&
      corepack prepare pnpm@9.12.3 --activate &&
      pnpm install --frozen-lockfile &&
      pnpm run --if-present build:libs
    "
  volumes:
    - .:/work:cached
    - pnpm-store:/pnpm/store
    - node_modules:/work/node_modules
    - frontend_node_modules:/work/apps/frontend/node_modules
    - backend_node_modules:/work/apps/backend/node_modules
    - render_node_modules:/work/packages/pong/render/node_modules
  networks: [devnet]
```

- image: node:22-bookworm
  - Uses the official Node 22 image on Debian (glibc). This is friendly to native modules like better-sqlite3 and avoids musl-related rebuild issues common on alpine.

- working_dir: /work
  - Sets the working directory to the repo root inside the container so pnpm can discover workspaces correctly.

- environment:
  - PNPM_STORE_DIR: /pnpm/store — ensures a dedicated path for pnpm store that we persist via a named volume.
  - TMPDIR: /tmp — directs temporary files to a writable temp directory.
  - COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" — disables Corepack prompts so CI/automation-friendly behavior is guaranteed.

- command: bash -lc "..."
  - bash -lc runs a login-like shell to ensure environment is initialized as expected. The script:
    1. corepack enable — enables package manager shims.
    2. corepack prepare pnpm@9.12.3 --activate — installs and activates the exact pnpm version specified in package.json (packageManager), matching the repo.
    3. pnpm install --frozen-lockfile — installs dependencies exactly as locked. Fails if lockfile is out of sync, protecting reproducibility.
    4. pnpm run --if-present build:libs — builds shared TypeScript libraries via tsc project references; this minimizes downstream build work.

- volumes:
  - .:/work:cached — bind-mounts your working tree. The cached flag is a performance hint for Docker Desktop-like environments; it’s safe elsewhere.
  - pnpm-store:/pnpm/store — persists pnpm cache for faster subsequent installs.
  - node_modules:/work/node_modules — provides a persistent volume for the root node_modules if used.
  - frontend_node_modules:/work/apps/frontend/node_modules — persists FE workspace dependencies.
  - backend_node_modules:/work/apps/backend/node_modules — persists BE workspace dependencies.
  - render_node_modules:/work/packages/pong/render/node_modules — persists the render package dependencies.

- networks: [devnet]
  - Connects deps to the same network as other services for consistency (though deps is an init step only).

Why this service exists: Frontend and backend run in watch mode and shouldn’t be responsible for performing full installs on each startup. Centralizing installs improves speed and reliability, and ensures node_modules volumes are ready before the dev servers boot.

---

## Service: frontend (Vite dev server)

Source excerpt:

```
# 2) Frontend (Vite dev server)
frontend:
  image: node:22-bookworm
  init: true
  working_dir: /work/apps/frontend
  environment:
    PNPM_STORE_DIR: /pnpm/store
    CHOKIDAR_USEPOLLING: "true"
    WATCHPACK_POLLING: "true"
  command: bash -lc "corepack enable && corepack prepare pnpm@9.12.3 --activate && pnpm dev"
  depends_on:
    deps:
      condition: service_completed_successfully
  ports:
    - "${FRONTEND_PORT:-5173}:5173"
  volumes:
    - .:/work:cached
    - pnpm-store:/pnpm/store
    - node_modules:/work/node_modules:ro
    - frontend_node_modules:/work/apps/frontend/node_modules
  networks: [devnet]
```

- image: node:22-bookworm
  - Same rationale as deps: native module friendliness and parity with local development environments.

- init: true
  - Uses a minimal init (tini) to properly forward signals and reap zombie processes. Helpful when running dev servers inside containers.

- working_dir: /work/apps/frontend
  - Executes commands inside the frontend workspace.

- environment:
  - PNPM_STORE_DIR: use the same persisted pnpm store.
  - CHOKIDAR_USEPOLLING: "true" and WATCHPACK_POLLING: "true" — enable polling-based file watching. This is often necessary in containerized dev environments where inotify events don’t propagate reliably across bind mounts.

- command: bash -lc "corepack enable && corepack prepare pnpm@9.12.3 --activate && pnpm dev"
  - Activates pnpm and starts the Vite dev server (pnpm dev). Vite handles HMR and proxies /api to backend when running inside the dev network (see your Vite config).

- depends_on: deps: condition: service_completed_successfully
  - Waits until dependency installation has completed successfully before starting FE. Prevents race conditions where FE starts with missing node_modules.

- ports: "${FRONTEND_PORT:-5173}:5173"
  - Exposes Vite’s port to the host. Defaults to 5173, overridable via FRONTEND_PORT in .env.

- volumes:
  - .:/work:cached — bind mounts the source code.
  - pnpm-store:/pnpm/store — uses the shared cache.
  - node_modules:/work/node_modules:ro — root node_modules read-only (mainly to ensure any implicit resolution is stable and not modified by FE).
  - frontend_node_modules:/work/apps/frontend/node_modules — FE workspace dependencies.

- networks: [devnet]
  - Enables FE to reach backend by its service name (backend:3001) and be reached by nginx.

---

## Service: backend (Fastify + tsx watch)

Source excerpt:

```
# 3) Backend (Fastify + tsx watch)
backend:
  image: node:22-bookworm
  init: true
  working_dir: /work/apps/backend
  env_file:
    - ./.env
  environment:
    PNPM_STORE_DIR: /pnpm/store
    CHOKIDAR_USEPOLLING: "true"
  command: bash -lc "corepack enable && corepack prepare pnpm@9.12.3 --activate && pnpm dev"
  depends_on:
    deps:
      condition: service_completed_successfully
  ports:
    - "${BACKEND_PORT:-3001}:3001"
  volumes:
    - .:/work:cached
    - pnpm-store:/pnpm/store
    - node_modules:/work/node_modules:ro
    - backend_node_modules:/work/apps/backend/node_modules:ro
    # sqlite data + uploads persist on host for easy inspection
    - ./apps/backend/data/sqlite:/data
    - ./apps/backend/data/sqlite/uploads:/data/uploads
  networks: [devnet]
```

- image: node:22-bookworm, init: true
  - Same reasons as frontend: good native module support and proper signal handling.

- working_dir: /work/apps/backend
  - Executes commands inside the backend workspace.

- env_file: ./.env
  - Loads environment variables from the repository’s root .env. This file controls ports and backend paths that the app reads (e.g., BACKEND_PORT, DATABASE_PATH=/data/db.sqlite, UPLOAD_DIR=/data/sqlite/uploads, SECRET, FRONTEND_URL, etc.).

- environment:
  - PNPM_STORE_DIR and CHOKIDAR_USEPOLLING — same rationale as frontend. Polling improves reliability of file change detection in containers.

- command: bash -lc "... && pnpm dev"
  - Starts the backend in watch mode (tsx) via the workspace script. Migrations run at server startup; static files are served under /uploads.

- depends_on: deps (service_completed_successfully)
  - Ensures dependencies are installed and shared volumes are populated before launching the backend.

- ports: "${BACKEND_PORT:-3001}:3001"
  - Exposes the backend to the host (useful for direct access and Swagger at /docs). In practice, nginx is the normal entrypoint for the browser.

- volumes:
  - .:/work:cached — code sync.
  - pnpm-store:/pnpm/store — shared pnpm cache.
  - node_modules:/work/node_modules:ro — stable root node_modules.
  - backend_node_modules:/work/apps/backend/node_modules:ro — backend deps (read-only here because deps service populates them; the backend itself shouldn’t modify installations).
  - ./apps/backend/data/sqlite:/data — binds the SQLite data directory to a host path for easy inspection and persistence.
  - ./apps/backend/data/sqlite/uploads:/data/uploads — persists uploaded files (avatars) on the host; nginx and the backend serve them.

- networks: [devnet]
  - Allows the backend to be discovered by nginx and frontend via service name.

---

## Service: nginx (single-origin dev)

Source excerpt:

```
# 4) Nginx (single-origin dev, optional but convenient)
nginx:
  image: nginx:1.27-alpine
  depends_on:
    - frontend
    - backend
  ports:
    - "${NGINX_PORT:-8080}:80"
  volumes:
    - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
  networks: [devnet]
```

- image: nginx:1.27-alpine
  - A small nginx image sufficient for reverse proxying in development. Alpine is fine here because we’re not building native modules.

- depends_on: frontend, backend
  - Ensures nginx starts after both app services are up, so routing targets are available.

- ports: "${NGINX_PORT:-8080}:80"
  - Exposes nginx on the host. Default is 8080, configurable through NGINX_PORT in .env.

- volumes: default.conf mounted read-only
  - Binds your nginx configuration into the container. The config does the following:
    - /api and /uploads → http://backend:3001
    - Vite HMR WS and everything else → http://frontend:5173
    - Disables buffering for HMR and sets appropriate headers for websockets and proxying.

- networks: [devnet]
  - Places nginx on the same network so it can route to the frontend and backend by service names.

---

## Why Node images, and why no Dockerfiles are needed (in dev)

- Zero-rebuild development: By bind-mounting the source and starting watch-mode servers, we avoid image rebuilds on every code change. This drastically shortens the inner dev loop.
- Native modules compatibility: node:22-bookworm (Debian/glibc) works well with better-sqlite3 and other native deps, avoiding slow or fragile rebuilds often seen on alpine.
- Corepack + pnpm parity: The Node image includes Corepack, so we can activate the exact pnpm version pinned in package.json (packageManager field) for consistent installs.
- Simpler maintenance: No need to maintain Dockerfiles for dev. The services share a single deps bootstrap, and use named volumes to cache installations.
- Fast feedback: Vite’s HMR and tsx watch mode work reliably with polling enabled, delivering fast updates without container rebuilds.

For development, this tradeoff (using base images + bind mounts) optimizes speed and simplicity. Custom Dockerfiles become more valuable in production when you’re producing lean, immutable images.

---

## What would differ in a production docker-compose.yml

While specifics depend on your deployment environment, a production Compose configuration typically differs as follows:

- Built images (no bind mounts):
  - Backend and frontend would be built via Dockerfiles (multi-stage builds). The final images contain compiled artifacts only (e.g., backend dist/, frontend static build) with no dev dependencies or source mounts.
  - The deps service would not exist; installs happen at image build time.

- Base images and sizes:
  - Use slim or alpine (if compatible) images for smaller footprints, or distroless for runtime-only containers.
  - For better-sqlite3 or other native modules, ensure the build stage provides required toolchains, with runtime stages containing only compiled artifacts.

- Environment and security:
  - NODE_ENV=production, no CHOKIDAR/WATCHPACK polling vars.
  - Read-only filesystems, non-root users, and stricter ulimits/capabilities where applicable.
  - Secrets and environment handled via secret managers or Compose secrets, not plain env files.

- Networking and exposure:
  - Only nginx (or the public edge) exposes ports to the host/ingress. The backend is internal-only.
  - Healthchecks and depends_on with conditions (service_healthy) ensure ordering and readiness.

- Frontend serving:
  - Nginx serves the frontend’s static build (e.g., from /usr/share/nginx/html) and reverse proxies /api and /uploads to the backend.
  - No Vite dev server; no HMR.

- Persistence and data stores:
  - SQLite might be replaced with a managed Postgres or MySQL in production. If SQLite remains, data volumes should be backed up and resilient.
  - Uploads should be served from durable storage (e.g. volume or object storage), with appropriate caching and CDN where relevant.

- Logging and observability:
  - Structured logging and log shipping to centralized systems (e.g., ELK, OpenSearch, Loki). Healthchecks and metrics endpoints for monitoring.

- Resource limits and scaling:
  - Use Compose/Swarm/Kubernetes resource limits. Horizontal scaling of stateless services (frontend, backend) as needed.

In summary, production emphasizes immutable, minimal images, secure defaults, and scalable architecture, while development prioritizes rapid iteration and convenience with mounted source and watch-mode processes.
