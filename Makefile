# Project / compose
NAME             = ft-transcendence-dev
ROOT_COMPOSE     = -f docker-compose.yml

# No user-mapping variables needed anymore; volumes are cleaned by helper image
# Node/pnpm strategy:
# - All pnpm commands run inside containers via Corepack (use `corepack pnpm`).
# - No global Corepack symlinks; we prefer a writable COREPACK_HOME inside containers.
# - The `deps` service installs workspace deps and builds libs; other services depend on it.

# Buildx (per-project builder)
BUILDER ?= $(NAME)-builder

# Env file passed to docker compose (keep secrets out of the Makefile)
ENV_ROOT         = --env-file .env

# Helper image for host filesystem cleanup
CLEAN_HELPER_IMG ?= alpine:3.19

# Known services (for helper targets)
SERVICES         = deps frontend backend nginx elastic_cert_setup elasticsearch kibana kibana-post logstash

# Ensure required bind-mount directories exist
define ensure_dirs
	@echo ">> Ensuring required bind-mount directories exist"
	@if [ ! -d "./apps/backend/data/sqlite/uploads" ]; then \
		mkdir -p ./apps/backend/data/sqlite/uploads; \
	fi
endef

# Ensure a project-scoped buildx builder exists and is selected
define ensure_builder
	@echo ">> Using buildx builder '$(BUILDER)'"
	@if ! docker buildx inspect $(BUILDER) >/dev/null 2>&1; then \
		echo ">> Creating buildx builder '$(BUILDER)'"; \
		docker buildx create --name $(BUILDER) --driver docker-container >/dev/null; \
	fi
	@docker buildx use $(BUILDER)
endef

# ========================
#  Orchestration
# ========================
.PHONY: all up detached elk elk-detached down down-elk clean prune-label nuke check-leftovers fclean re stop restart restart-elk restart-% builder-init builder-use builder-prune builder-rm check-leftovers-global overview-docker
all: up

up:
	$(ensure_dirs)
	$(ensure_builder)
	@echo ">> Starting default stack (attached)"
	docker compose -p $(NAME) $(ROOT_COMPOSE) $(ENV_ROOT) up --build

detached:
	$(ensure_dirs)
	$(ensure_builder)
	@echo ">> Starting default stack (detached)"
	docker compose -p $(NAME) $(ROOT_COMPOSE) $(ENV_ROOT) up --build -d

elk:
	$(ensure_dirs)
	$(ensure_builder)
	@echo ">> Starting profile 'elk' (attached)"
	docker compose -p $(NAME) --profile elk up --build

elk-detached:
	$(ensure_dirs)
	$(ensure_builder)
	@echo ">> Starting profile 'elk' (detached)"
	docker compose -p $(NAME) --profile elk up --build -d

down:
	@echo ">> Stopping & removing default stack (volumes, local images, orphans)"
	docker compose -p $(NAME) $(ROOT_COMPOSE) $(ENV_ROOT) --profile elk down -v --rmi local --remove-orphans

down-elk:
	@echo ">> Stopping & removing profile 'elk' (volumes, local images, orphans)"
	docker compose -p $(NAME) --profile elk down -v --rmi local --remove-orphans

# ========================
#  Cleaning
# ========================
# 'clean' performs a project-scoped removal of containers, networks, volumes, images, plus local dev artifacts
clean:
	@echo ">> CLEAN: project-scoped cleanup (this compose project only)"
	-$(MAKE) down
	@echo ">> Removing containers labeled to this project"
	- docker ps         -aq --filter "label=com.docker.compose.project=$(NAME)" | xargs -r docker rm -f
	@echo ">> Removing networks labeled to this project"
	- docker network ls -q  --filter "label=com.docker.compose.project=$(NAME)" | xargs -r docker network rm
	@echo ">> Removing volumes labeled to this project"
	- docker volume ls  -q  --filter "label=com.docker.compose.project=$(NAME)" | xargs -r docker volume rm
	@echo ">> Removing images labeled to this project"
	- docker image ls   -q  --filter "label=com.docker.compose.project=$(NAME)" | xargs -r docker rmi -f
	@echo ">> Pruning UNUSED resources with this project label"
	-$(MAKE) prune-label
	@echo ">> Removing workspace artifacts via helper image ($(CLEAN_HELPER_IMG))"
	@docker run --rm -v "$(CURDIR)":/work -w /work $(CLEAN_HELPER_IMG) \
	  sh -c "\
	    if [ -d ./.pnpm-store ]; then echo '>> Deleting ./.pnpm-store'; rm -rf ./.pnpm-store; fi; \
	    if [ -d ./apps/backend/data ]; then echo '>> Deleting ./apps/backend/data'; rm -rf ./apps/backend/data; fi; \
	    if [ -d ./apps/frontend/.vite ]; then echo '>> Deleting ./apps/frontend/.vite'; rm -rf ./apps/frontend/.vite; fi; \
	    if [ -d ./packages/pong/game-logic/dist ]; then echo '>> Deleting ./packages/pong/game-logic/dist'; rm -rf ./packages/pong/game-logic/dist; fi; \
	    if [ -d ./packages/pong/game-logic/node_modules ]; then echo '>> Deleting ./packages/pong/game-logic/node_modules'; rm -rf ./packages/pong/game-logic/node_modules; fi; \
	    if [ -d ./packages/pong/render/dist ]; then echo '>> Deleting ./packages/pong/render/dist'; rm -rf ./packages/pong/render/dist; fi; \
	    if [ -d ./packages/pong/shared/dist ]; then echo '>> Deleting ./packages/pong/shared/dist'; rm -rf ./packages/pong/shared/dist; fi \
	  "
	@echo ">> Removing additional workspace artifacts (host)"
	@if [ -d ./apps/backend/node_modules ]; then echo '>> Deleting ./apps/backend/node_modules'; rm -rf ./apps/backend/node_modules; fi
	@if [ -d ./apps/frontend/node_modules ]; then echo '>> Deleting ./apps/frontend/node_modules'; rm -rf ./apps/frontend/node_modules; fi
	@if [ -d ./node_modules ]; then echo '>> Deleting ./node_modules'; rm -rf ./node_modules; fi
	@if [ -f ./packages/pong/game-logic/tsconfig.tsbuildinfo ]; then echo '>> Deleting ./packages/pong/game-logic/tsconfig.tsbuildinfo'; rm -f ./packages/pong/game-logic/tsconfig.tsbuildinfo; fi
	@if [ -d ./packages/pong/render/node_modules ]; then echo '>> Deleting ./packages/pong/render/node_modules'; rm -rf ./packages/pong/render/node_modules; fi
	@if [ -f ./packages/pong/render/tsconfig.tsbuildinfo ]; then echo '>> Deleting ./packages/pong/render/tsconfig.tsbuildinfo'; rm -f ./packages/pong/render/tsconfig.tsbuildinfo; fi
	@if [ -f ./packages/pong/shared/tsconfig.tsbuildinfo ]; then echo '>> Deleting ./packages/pong/shared/tsconfig.tsbuildinfo'; rm -f ./packages/pong/shared/tsconfig.tsbuildinfo; fi
	@echo ">> Removing helper image ($(CLEAN_HELPER_IMG))"
	- docker image rm -f $(CLEAN_HELPER_IMG) || true

# 'fclean' = clean + remove per-project build cache & builder
fclean:
	@echo ">> FCLEAN: clean + prune build cache + remove builder"
	-$(MAKE) clean
	@echo ">> Pruning build cache for builder '$(BUILDER)'"
	-$(MAKE) builder-prune
	@echo ">> Removing builder '$(BUILDER)'"
	-$(MAKE) builder-rm

re: fclean up

stop:
	@echo ">> Stopping all running containers in this compose project"
	docker compose -p $(NAME) stop

restart:
	@echo ">> Restarting services in default stack"
	docker compose -p $(NAME) $(ROOT_COMPOSE) $(ENV_ROOT) restart

restart-elk:
	@echo ">> Restarting services in profile 'elk'"
	docker compose -p $(NAME) --profile elk restart

restart-%:
	@echo ">> Restarting service '$*' (if present in any compose file)"
	@if echo "$(SERVICES)" | grep -qw "$*"; then \
		docker compose -p $(NAME) -f docker-compose.yml restart $* || true; \
		docker compose -p $(NAME) -f log-management/docker-compose.yml --env-file log-management/.env restart $* || true; \
	else \
		echo "Usage: make restart-[service]"; \
		echo "Available services: $(SERVICES)"; \
	fi

# ========================
#  Buildx helpers
# ========================
builder-init:
	@echo ">> Ensuring buildx builder '$(BUILDER)' exists and is selected"
	@if docker buildx inspect $(BUILDER) >/dev/null 2>&1; then \
		echo ">> Builder '$(BUILDER)' already exists."; \
	else \
		docker buildx create --name $(BUILDER) --driver docker-container --use; \
	fi

builder-use:
	@echo ">> Selecting buildx builder '$(BUILDER)'"
	docker buildx use $(BUILDER)

builder-prune:
	@echo ">> Pruning build cache for builder '$(BUILDER)'"
	docker buildx prune -af --builder $(BUILDER)

builder-rm:
	@echo ">> Removing buildx builder '$(BUILDER)' (and its cache)"
	- docker buildx rm -f $(BUILDER)

# ========================
#  Project-scoped prunes & checks
# ========================
prune-label:
	@echo ">> docker *prune (containers/images/networks/volumes) — scoped by project label"
	- docker container prune -f --filter "label=com.docker.compose.project=$(NAME)"
	- docker image     prune -f --filter "label=com.docker.compose.project=$(NAME)"
	- docker network   prune -f --filter "label=com.docker.compose.project=$(NAME)"
	- docker volume    prune -f --filter "label=com.docker.compose.project=$(NAME)"

nuke:
	@if [ "$(CONFIRM)" != "1" ]; then \
		echo "!! DANGER: This prunes ALL UNUSED Docker data on your machine (global)."; \
		echo "!! Re-run with:  make nuke CONFIRM=1"; \
		exit 1; \
	fi
	@echo ">> GLOBAL prune: docker system prune -af --volumes"
	- docker system prune  -af --volumes
	@echo ">> GLOBAL builder prune: docker builder prune -af"
	- docker builder prune -af

# Global overview of all Docker resources and Buildx caches
overview-docker:
	@echo ">> GLOBAL: docker system df -v (disk usage overview)"
	- docker system df -v
	@echo ">> GLOBAL: All containers (any project)"
	- docker ps -a
	@echo ">> GLOBAL: All images"
	- docker image ls --format '{{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.CreatedSince}}'
	@echo ">> GLOBAL: All networks"
	- docker network ls
	@echo ">> GLOBAL: All volumes"
	- docker volume ls

# --------------------------
# Default target: show usage
# --------------------------
.PHONY: help
help:
	@echo "Usage:"
	@echo "  make / make up            # Build & start default stack [uses Buildx '$(BUILDER)']"
	@echo "  make detached             # Same as 'up', but detached (-d)"
	@echo "  make elk                  # Start compose profile 'elk' (attached)"
	@echo "  make elk-detached         # Start compose profile 'elk' (detached)"
	@echo "  make down                 # Stop & remove default stack (+volumes, local images, orphans)"
	@echo "  make down-elk             # Stop & remove profile 'elk' (+volumes, local images, orphans)"
	@echo "  make clean                # Project-scoped cleanup (containers, networks, volumes, images, package store, app data)"
	@echo "  make fclean               # 'clean' + prune builder cache + remove builder"
	@echo "  make re                   # fclean + up"
	@echo "  make prune-label          # Prune UNUSED resources with this project's label"
	@echo "  make nuke CONFIRM=1       # GLOBAL prune of ALL UNUSED Docker data (+builder cache)"
	@echo "  overview-docker           # Show ALL Docker resources on this machine"
	@echo ""
	@echo "Build cache (Option A - per-project builder):"
	@echo "  make builder-init         # Create/select the per-project buildx builder"
	@echo "  make builder-use          # Select it explicitly (current shell/session)"
	@echo "  make builder-prune        # Prune ONLY this builder's cache"
	@echo "  make builder-rm           # Remove the builder & its cache"
	@echo ""
	@echo "Utilities:"
	@echo "  make ps                   # Show containers (status)"
	@echo "  make logs-[service]       # Follow logs for a service"
	@echo "  make sh-[service]         # Open /bin/sh in a service"
	@echo "  make bash-[service]       # Open bash (fallback: sh) in a service"
	@echo "  make restart              # Restart services in default stack"
	@echo "  make restart-elk          # Restart services in profile 'elk'"
	@echo "  make restart-[service]    # Restart a single service by name"
	@echo "  make stop                 # Stop all containers in this compose project"
	@echo ""
	@echo "Repo tasks (via deps container):"
	@echo "  make pnpm-install         # pnpm install (root lockfile)"
	@echo "  make build                # pnpm build (libs + frontend)"
	@echo "  make typecheck            # pnpm typecheck (all)"
	@echo "  make lint                 # pnpm lint (all)"
	@echo "  make fmt-check            # prettier --check"
	@echo "  make fmt                  # prettier --write"
	@echo "  make test                 # pnpm test (all)"
	@echo "  make migrate              # backend migrations"
	@echo "  make db-reset             # wipe ./apps/backend/data"

# ========================
#  Logs & utilities
# ========================
.PHONY: ps logs-% sh-% bash-%
ps:
	@echo ">> docker compose ps (project: $(NAME))"
	docker compose -p $(NAME) ps

logs-%:
	@echo ">> Attaching logs for service '$*'"
	@if echo "$(SERVICES)" | grep -qw "$*"; then \
		docker compose -p $(NAME) logs -f $*; \
	else \
		echo "Usage: make logs-[service]"; \
		echo "Available services: $(SERVICES)"; \
	fi

sh-%:
	@echo ">> Opening /bin/sh in service '$*'"
	@if echo "$(SERVICES)" | grep -qw "$*"; then \
		docker compose -p $(NAME) exec -it $* sh; \
	else \
		echo "Usage: make sh-[service]"; \
		echo "Available services: $(SERVICES)"; \
	fi

bash-%:
	@echo ">> Opening bash (fallback: sh) in service '$*'"
	@if echo "$(SERVICES)" | grep -qw "$*"; then \
		docker compose -p $(NAME) exec -it $* bash || docker compose -p $(NAME) exec -it $* sh; \
	else \
		echo "Usage: make bash-[service]"; \
		echo "Available services: $(SERVICES)"; \
	fi

# ========================
#  Repo tasks (pnpm via deps svc; no host pnpm needed)
# ========================
.PHONY: pnpm-install build typecheck lint fmt-check fmt test migrate db-reset

pnpm-install:
	@echo ">> Running pnpm install in 'deps' container"
	docker compose -p $(NAME) run --rm deps bash -lc "COREPACK_ENABLE_DOWNLOAD_PROMPT=0 COREPACK_HOME=/tmp/corepack corepack pnpm install --frozen-lockfile"

build:
	@echo ">> Running pnpm build via 'deps' container"
	docker compose -p $(NAME) run --rm deps bash -lc "COREPACK_ENABLE_DOWNLOAD_PROMPT=0 COREPACK_HOME=/tmp/corepack corepack pnpm run build"

typecheck:
	@echo ">> Type checking all packages via 'deps' container"
	docker compose -p $(NAME) run --rm deps bash -lc "COREPACK_ENABLE_DOWNLOAD_PROMPT=0 COREPACK_HOME=/tmp/corepack corepack pnpm run typecheck"

lint:
	@echo ">> Linting all packages via 'deps' container"
	docker compose -p $(NAME) run --rm deps bash -lc "COREPACK_ENABLE_DOWNLOAD_PROMPT=0 COREPACK_HOME=/tmp/corepack corepack pnpm run lint"

fmt-check:
	@echo ">> Prettier check via 'deps' container"
	docker compose -p $(NAME) run --rm deps bash -lc "COREPACK_ENABLE_DOWNLOAD_PROMPT=0 COREPACK_HOME=/tmp/corepack corepack pnpm run check-format"

fmt:
	@echo ">> Prettier write via 'deps' container"
	docker compose -p $(NAME) run --rm deps bash -lc "COREPACK_ENABLE_DOWNLOAD_PROMPT=0 COREPACK_HOME=/tmp/corepack corepack pnpm run fix-format"

test:
	@echo ">> Running tests via 'deps' container"
	docker compose -p $(NAME) run --rm deps bash -lc "COREPACK_ENABLE_DOWNLOAD_PROMPT=0 COREPACK_HOME=/tmp/corepack corepack pnpm test"

migrate:
	@echo ">> Running backend migrations"
	docker compose -p $(NAME) run --rm backend bash -lc "COREPACK_ENABLE_DOWNLOAD_PROMPT=0 COREPACK_HOME=/tmp/corepack corepack pnpm migrate"

db-reset:
	@echo ">> Removing app data directory (if present)"
	@if [ -d "./apps/backend/data" ]; then rm -rf ./apps/backend/data; fi

# Catch-all for unknown targets
%:
	@echo "Unknown command: $@"
	@$(MAKE) help
