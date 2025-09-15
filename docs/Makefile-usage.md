# Makefile Guide

This Makefile wraps Docker Compose and Buildx to run the full dev stack consistently. It does not require Node on the host; everything runs in containers.

## Prerequisites

- Docker Engine with the Compose plugin
- Buildx available (Docker Desktop includes it)
- A `.env` file at the repo root (copy from `.env.example` if needed)

## Quick Start

- Start the default stack (attached):
  - `make up`
- Start the default stack (detached):
  - `make detached`

Default ports (overridable via `.env`):

- Frontend: `FRONTEND_PORT` (default 5173)
- Backend: `BACKEND_PORT` (default 3001)
- Nginx proxy: `NGINX_PORT` (default 8080)

## ELK Profile (optional)

- Start with logging stack (attached):
  - `make elk`
- Start with logging stack (detached):
  - `make elk-detached`

## Stop and Teardown

- Stop running containers in this project:
  - `make stop`
- Restart services in the default stack:
  - `make restart`
- Restart services in the ELK profile:
  - `make restart-elk`
- Restart a specific service (where defined):
  - `make restart-<service>` (e.g., `make restart-backend`)
- Stop and remove default stack (+volumes, local images, orphans):
  - `make down`
- Stop and remove ELK profile (+volumes, local images, orphans):
  - `make down-elk`

## Cleaning

- Project‑scoped cleanup (containers, networks, volumes, images) plus workspace artifacts:
  - `make clean`
  - Also removes workspace‑level package store and backend data using a helper image.
- Full clean + prune build cache + remove builder:
  - `make fclean`
- Recreate from scratch:
  - `make re` (equivalent to `fclean` then `up`)
- Prune only resources labeled to this project:
  - `make prune-label`
- Show remaining project‑labeled resources:
  - `make check-leftovers`
- Global prune of ALL UNUSED Docker data (dangerous if you have other projects):
  - `make nuke CONFIRM=1`

## Notes

- The Makefile ensures a per‑project Buildx builder (named `ft-transcendence-dev-builder` by default) and selects it automatically for build commands.
- Compose project name defaults to `ft-transcendence-dev` and is used for resource labels and pruning.
- Backend data (SQLite and uploads) live under `apps/backend/data/sqlite` on the host during development and are removed by `make clean`.
- Package installs happen inside containers using Corepack+pnpm; no host pnpm setup is required.
