# Project / compose
NAME             = ft-transcendence-dev
NAME_PROD        = ft-transcendence-prod
ROOT_COMPOSE     = -f docker-compose.yml
PROD_COMPOSE     = -f docker-compose-prod.yml
MON_PROD_COMPOSE = -f ./monitoring/docker-compose-base.yml
MON_DEV_COMPOSE  = -f ./monitoring/docker-compose-base.yml -f ./monitoring/docker-compose-dev.yml
LOG_PROD_COMPOSE = -f ./log-management/docker-compose-base.yml
LOG_DEV_COMPOSE  = -f ./log-management/docker-compose-base.yml -f ./log-management/docker-compose-dev.yml
BUILDER_NAME     = ft-transcendence

# No user-mapping variables needed anymore; volumes are cleaned by helper image
# Node/pnpm strategy:
# - All pnpm commands run inside containers via Corepack (use `corepack pnpm`).
# - No global Corepack symlinks; we prefer a writable COREPACK_HOME inside containers.
# - The `deps` service installs workspace deps and builds libs; other services depend on it.

# Buildx is shared between dev and prod so we share cache
BUILDER ?= $(BUILDER_NAME)-builder
BUILDKIT_BASE_IMG ?= moby/buildkit:buildx-stable-1
BUILDER_IMAGE    ?= $(BUILDER_NAME)-buildkit:latest

# Grouped prod compose bundles (full vs slim)
PROD_FULL_STACK = $(PROD_COMPOSE) $(MON_PROD_COMPOSE) $(LOG_PROD_COMPOSE)
PROD_SLIM_STACK = $(PROD_COMPOSE)

# Prod build/run helper macros
define prod_build
	@echo ">> Building with BUILDKIT_INLINE_CACHE enabled"
	DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 \
	docker compose -p $(NAME_PROD) $(ENV_ROOT) $(1) build
endef

define prod_up
	@echo ">> Starting services"
	docker compose -p $(NAME_PROD) $(ENV_ROOT) $(1) up $(2)
endef

# Env file passed to docker compose (keep secrets out of the Makefile)
ENV_ROOT         = --env-file .env

# Helper image for host filesystem cleanup
CLEAN_HELPER_IMG ?= alpine:3.19

# Known services (for helper targets)
SERVICES         = deps frontend backend nginx elastic_cert_setup elasticsearch kibana kibana-post logstash game-server matchmaking game-gateway chat allocator scorer

# Ensure required bind-mount directories exist
# 1000:1000 == UID:GID of node user inside of container
# 777 permissions needed on iMacs
define ensure_dirs
	@echo ">> Ensuring required bind-mount directories exist"
	@if [ ! -d "./apps/backend/data/sqlite/uploads" ]; then \
		mkdir -p ./apps/backend/data/sqlite/uploads; \
		if [ "$$(id -u)" = "0" ]; then \
			echo ">> Chowning."; \
  			chown -R 1000:1000 ./apps/backend/data; \
		else \
			echo ">> Skipping chown; using chmod instead."; \
			chmod -R 777 ./apps/backend/data; \
		fi; \
	fi
endef


# Verify required env variables are present before starting services
define ensure_env
	@echo ">> Validating required environment variables (.env)"
	@node scripts/check-env.mjs --quiet
endef

# Ensure a project-scoped buildx builder exists and is selected
define ensure_builder
	@echo ">> Using buildx builder '$(BUILDER)'"
	@if ! docker buildx inspect $(BUILDER) >/dev/null 2>&1; then \
		echo ">> Preparing BuildKit image '$(BUILDER_IMAGE)' from '$(BUILDKIT_BASE_IMG)'"; \
		if ! docker image inspect $(BUILDER_IMAGE) >/dev/null 2>&1; then \
			docker image pull $(BUILDKIT_BASE_IMG) >/dev/null; \
			docker image tag  $(BUILDKIT_BASE_IMG) $(BUILDER_IMAGE); \
		fi; \
		echo ">> Creating buildx builder '$(BUILDER)' (image=$(BUILDER_IMAGE))"; \
		docker buildx create --name $(BUILDER) --driver docker-container --driver-opt image=$(BUILDER_IMAGE) >/dev/null; \
	fi
	@docker buildx use $(BUILDER)
endef

define ensure_certs
	@echo "Ensuring that certs for HTTPS exist."
	@if [ ! -f ./certs/cert.pem ]; then \
		mkdir -p certs; \
		openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
		-keyout ./certs/key.pem -out ./certs/cert.pem -subj '/CN=localhost'; \
		chmod 644 ./certs/key.pem; \
	fi
endef


# ========================
#  Orchestration
# ========================
.PHONY: all up detached prod prod-detached prod-slim prod-slim-detached elk elk-detached mon mon-detached dev-full dev-full-detached down clean nuke check-leftovers fclean re stop restart restart-% builder-init builder-use builder-prune builder-rm check-leftovers-global overview-docker
all: up

up:
	$(ensure_dirs)
	$(ensure_env)
	$(ensure_builder)
	@echo ">> Starting default stack (attached)"
	docker compose -p $(NAME) $(ROOT_COMPOSE) $(ENV_ROOT) up --build


detached:
	$(ensure_dirs)
	$(ensure_env)
	$(ensure_builder)
	@echo ">> Starting default stack (detached)"
	docker compose -p $(NAME) $(ROOT_COMPOSE) $(ENV_ROOT) up --build -d

prod:
	$(ensure_dirs)
	$(ensure_env)
	$(ensure_builder)
	$(ensure_certs)
	@echo ">> Starting prod stack (attached)"
	$(call prod_build,$(PROD_FULL_STACK))
	$(call prod_up,$(PROD_FULL_STACK),)

prod-detached:
	$(ensure_dirs)
	$(ensure_env)
	$(ensure_builder)
	$(ensure_certs)
	@echo ">> Starting prod stack (detached)"
	$(call prod_build,$(PROD_FULL_STACK))
	$(call prod_up,$(PROD_FULL_STACK),-d)

prod-slim:
	$(ensure_dirs)
	$(ensure_env)
	$(ensure_builder)
	$(ensure_certs)
	@echo ">> Starting prod stack without monitoring/ELK (attached)"
	$(call prod_build,$(PROD_SLIM_STACK))
	$(call prod_up,$(PROD_SLIM_STACK),)

prod-slim-detached:
	$(ensure_dirs)
	$(ensure_env)
	$(ensure_builder)
	$(ensure_certs)
	@echo ">> Starting prod stack without monitoring/ELK (detached)"
	$(call prod_build,$(PROD_SLIM_STACK))
	$(call prod_up,$(PROD_SLIM_STACK),-d)

elk:
	$(ensure_dirs)
	$(ensure_env)
	$(ensure_builder)
	@echo ">> Starting profile 'elk' (attached)"
	docker compose -p $(NAME) $(ROOT_COMPOSE) $(ENV_ROOT) \
		${LOG_DEV_COMPOSE} \
		up --build

elk-detached:
	$(ensure_dirs)
	$(ensure_env)
	$(ensure_builder)
	@echo ">> Starting profile 'elk' (detached)"
	docker compose -p $(NAME) $(ROOT_COMPOSE) $(ENV_ROOT) \
		${LOG_DEV_COMPOSE} \
		up --build -d

mon:
	$(ensure_dirs)
	$(ensure_env)
	$(ensure_builder)
	docker compose -p $(NAME) $(ENV_ROOT) $(ROOT_COMPOSE) \
		${MON_DEV_COMPOSE} \
		up --build

mon-detached:
	$(ensure_dirs)
	$(ensure_env)
	$(ensure_builder)
	docker compose -p $(NAME) $(ENV_ROOT) $(ROOT_COMPOSE) \
		${MON_DEV_COMPOSE} \
		up --build -d

dev-full:
	$(ensure_dirs)
	$(ensure_env)
	$(ensure_builder)
	@echo ">> Starting dev stack with monitoring + ELK (attached)"
	docker compose -p $(NAME) $(ROOT_COMPOSE) $(ENV_ROOT) \
		${MON_DEV_COMPOSE} \
		${LOG_DEV_COMPOSE} \
		up --build

dev-full-detached:
	$(ensure_dirs)
	$(ensure_env)
	$(ensure_builder)
	@echo ">> Starting dev stack with monitoring + ELK (detached)"
	docker compose -p $(NAME) $(ROOT_COMPOSE) $(ENV_ROOT) \
		${MON_DEV_COMPOSE} \
		${LOG_DEV_COMPOSE} \
		up --build -d

down:
	@echo ">> Stopping & removing default stack (volumes, local images, orphans)"
	- docker compose -p $(NAME) $(ROOT_COMPOSE) $(ENV_ROOT) \
		${MON_DEV_COMPOSE} \
		${LOG_DEV_COMPOSE} \
		down -v --rmi local --remove-orphans
	@echo ">> Stopping & removing prod stack (volumes, local images, orphans)"
	- docker compose -p $(NAME_PROD) $(PROD_COMPOSE) $(ENV_ROOT) \
		${MON_PROD_COMPOSE} \
		${LOG_PROD_COMPOSE} \
		down -v --rmi local --remove-orphans

# Keep images and named volumes
down-soft:
	@echo ">> Stopping & removing default stack (volumes, local images, orphans)"
	- docker compose -p $(NAME) $(ROOT_COMPOSE) $(ENV_ROOT) \
		${MON_DEV_COMPOSE} \
		${LOG_DEV_COMPOSE} \
		down --remove-orphans
	@echo ">> Stopping & removing prod stack (volumes, local images, orphans)"
	- docker compose -p $(NAME_PROD) $(PROD_COMPOSE) $(ENV_ROOT) \
		${MON_PROD_COMPOSE} \
		${LOG_PROD_COMPOSE} \
		down --remove-orphans


# ========================
#  Cleaning
# ========================
# 'clean' performs a project-scoped removal of containers, networks, volumes, images, plus local dev artifacts
# Currently removes `node_modules` meaning you will have to run `pnpm install` after this.
clean:
	@echo ">> CLEAN: project-scoped cleanup (dev and prod projects)"
	-$(MAKE) down
	@echo ">> Removing containers labeled to dev project ($(NAME))"
	- docker ps         -aq --filter "label=com.docker.compose.project=$(NAME)" | xargs -r docker rm -f
	@echo ">> Removing containers labeled to prod project ($(NAME_PROD))"
	- docker ps         -aq --filter "label=com.docker.compose.project=$(NAME_PROD)" | xargs -r docker rm -f
	@echo ">> Removing networks labeled to dev project ($(NAME))"
	- docker network ls -q  --filter "label=com.docker.compose.project=$(NAME)" | xargs -r docker network rm
	@echo ">> Removing networks labeled to prod project ($(NAME_PROD))"
	- docker network ls -q  --filter "label=com.docker.compose.project=$(NAME_PROD)" | xargs -r docker network rm
	@echo ">> Removing volumes labeled to dev project ($(NAME))"
	- docker volume ls  -q  --filter "label=com.docker.compose.project=$(NAME)" | xargs -r docker volume rm
	@echo ">> Removing volumes labeled to prod project ($(NAME_PROD))"
	- docker volume ls  -q  --filter "label=com.docker.compose.project=$(NAME_PROD)" | xargs -r docker volume rm
	@echo ">> Removing images labeled to dev project ($(NAME))"
	- docker image ls   -q  --filter "label=com.docker.compose.project=$(NAME)" | xargs -r docker rmi -f
	@echo ">> Removing images labeled to prod project ($(NAME_PROD))"
	- docker image ls   -q  --filter "label=com.docker.compose.project=$(NAME_PROD)" | xargs -r docker rmi -f
	@echo ">> Removing workspace artifacts via helper image ($(CLEAN_HELPER_IMG))"
	@docker run --rm -v "$(CURDIR)":/work -w /work $(CLEAN_HELPER_IMG) \
	  sh -c "\
	    echo '>> Finding and removing all node_modules directories...'; \
	    find . -name 'node_modules' -type d -prune -exec rm -rf {} + 2>/dev/null || true; \
	    echo '>> Finding and removing all dist directories...'; \
	    find . -name 'dist' -type d -prune -exec rm -rf {} + 2>/dev/null || true; \
	    echo '>> Finding and removing all tsconfig.tsbuildinfo files...'; \
	    find . -name 'tsconfig.tsbuildinfo' -type f -delete 2>/dev/null || true; \
	    echo '>> Removing .pnpm-store...'; \
	    if [ -d ./.pnpm-store ]; then rm -rf ./.pnpm-store; fi; \
	    echo '>> Removing backend data...'; \
	    if [ -d ./apps/backend/data ]; then rm -rf ./apps/backend/data; fi; \
	    echo '>> Removing frontend .vite cache...'; \
	    if [ -d ./apps/frontend/.vite ]; then rm -rf ./apps/frontend/.vite; fi; \
	    echo '>> Removing HTTPS certs...'; \
	    if [ -d ./certs ]; then rm -rf ./certs; fi \
	  "
	@echo ">> Removing helper image ($(CLEAN_HELPER_IMG))"
	- docker image rm -f $(CLEAN_HELPER_IMG) || true


# 'fclean' = clean + remove per-project build cache & builder
fclean:
	@echo ">> FCLEAN: clean + prune build cache + remove builder"
	-$(MAKE) clean
	@echo ">> Removing images referenced by dev compose"
	- docker compose -p $(NAME) $(ROOT_COMPOSE) ${MON_DEV_COMPOSE} ${LOG_DEV_COMPOSE} \
		$(ENV_ROOT) config --images | sort -u | xargs -r docker image rm -f
	@echo ">> Removing images referenced by prod compose"
	- docker compose -p $(NAME_PROD) $(PROD_COMPOSE) ${MON_PROD_COMPOSE} ${LOG_PROD_COMPOSE} \
		$(ENV_ROOT) config --images | sort -u | xargs -r docker image rm -f
	@echo ">> Pruning build cache for builder '$(BUILDER)'"
	-$(MAKE) builder-prune
	@echo ">> Removing builder '$(BUILDER)'"
	-$(MAKE) builder-rm
	@echo ">> Removing leftover BuildKit cache volumes for '$(BUILDER)'"
	- docker volume ls -q --filter "name=buildx_buildkit_$(BUILDER)" | xargs -r docker volume rm || true
	@echo ">> Removing project-scoped BuildKit image '$(BUILDER_IMAGE)'"
	- docker image rm -f $(BUILDER_IMAGE) || true
	@echo ">> (Optional) Removing upstream BuildKit base if unused: $(BUILDKIT_BASE_IMG)"
	- docker image rm -f $(BUILDKIT_BASE_IMG) || true

re: fclean up

stop:
	@echo ">> Stopping all running containers in this compose project"
	docker compose -p $(NAME) stop

restart:
	$(ensure_env)
	@echo ">> Detecting and restarting currently running services"
	@if docker ps --filter "label=com.docker.compose.project=$(NAME_PROD)" --format '{{.Names}}' | head -n1 | grep -q .; then \
		echo ">> Detected prod stack - restarting all services"; \
		docker compose -p $(NAME_PROD) $(PROD_COMPOSE) $(ENV_ROOT) \
			${MON_PROD_COMPOSE} \
			${LOG_PROD_COMPOSE} \
			restart; \
	elif docker ps --filter "label=com.docker.compose.project=$(NAME)" --format '{{.Names}}' | head -n1 | grep -q .; then \
		echo ">> Detected dev stack - restarting all services"; \
		docker compose -p $(NAME) $(ROOT_COMPOSE) $(ENV_ROOT) \
			${MON_DEV_COMPOSE} \
			${LOG_DEV_COMPOSE} \
			restart; \
	else \
		echo ">> Error: No running services detected in either dev or prod stacks"; \
		echo ">> Use 'make ps' to check container status"; \
		exit 1; \
	fi

restart-%:
	$(ensure_env)
	@echo ">> Detecting stack and restarting service '$*'"
	@if docker ps --filter "label=com.docker.compose.project=$(NAME_PROD)" --filter "label=com.docker.compose.service=$*" --format '{{.Names}}' | head -n1 | grep -q .; then \
		echo ">> Found '$*' in prod stack - restarting"; \
		docker compose -p $(NAME_PROD) $(PROD_COMPOSE) $(ENV_ROOT) \
			${MON_PROD_COMPOSE} \
			${LOG_PROD_COMPOSE} \
			restart $*; \
	elif docker ps --filter "label=com.docker.compose.project=$(NAME)" --filter "label=com.docker.compose.service=$*" --format '{{.Names}}' | head -n1 | grep -q .; then \
		echo ">> Found '$*' in dev stack - restarting"; \
		docker compose -p $(NAME) $(ROOT_COMPOSE) $(ENV_ROOT) \
			${MON_DEV_COMPOSE} \
			${LOG_DEV_COMPOSE} \
			restart $*; \
	else \
		echo ">> Error: Service '$*' not found or not running in either stack"; \
		echo ">> Use 'make ps' to see available services"; \
		exit 1; \
	fi

# ========================
#  Buildx helpers
# ========================
builder-init:
	@echo ">> Ensuring buildx builder '$(BUILDER)' exists and is selected"
	@if docker buildx inspect $(BUILDER) >/dev/null 2>&1; then \
			echo ">> Builder '$(BUILDER)' already exists."; \
	else \
			echo ">> Preparing BuildKit image '$(BUILDER_IMAGE)' from '$(BUILDKIT_BASE_IMG)'"; \
			if ! docker image inspect $(BUILDER_IMAGE) >/dev/null 2>&1; then \
					docker image pull $(BUILDKIT_BASE_IMG) >/dev/null; \
					docker image tag  $(BUILDKIT_BASE_IMG) $(BUILDER_IMAGE); \
			fi; \
			docker buildx create --name $(BUILDER) --driver docker-container --driver-opt image=$(BUILDER_IMAGE) --use; \
	fi

builder-use:
	@echo ">> Selecting buildx builder '$(BUILDER)'"
	docker buildx use $(BUILDER)

builder-prune:
	@echo ">> Pruning build cache for builder '$(BUILDER)'"
	docker buildx prune -af --builder $(BUILDER)
	- docker buildx prune -af --builder ft-transcendence-dev-builder # leftover from old setup

builder-rm:
	@echo ">> Removing buildx builder '$(BUILDER)' (and its cache)"
	- docker buildx rm -f $(BUILDER)
	- docker buildx rm -f ft-transcendence-dev-builder # leftover from old setup

# ========================
#  Project-scoped prunes & checks
# ========================

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
	@echo ""
	@echo "Development mode (pick and choose):"
	@echo "  make / make up                       # Dev only"
	@echo "  make detached                        # Dev only (detached)"
	@echo "  make mon                             # Dev + Monitoring (Prometheus/Grafana)"
	@echo "  make mon-detached                    # Dev + Monitoring (detached)"
	@echo "  make elk                             # Dev + ELK (Elasticsearch/Kibana/Logstash)"
	@echo "  make elk-detached                    # Dev + ELK (detached)"
	@echo "  make dev-full                        # Dev + Monitoring + ELK"
	@echo "  make dev-full-detached               # Dev + Monitoring + ELK (detached)"
	@echo ""
	@echo "Production mode (always with monitoring + ELK):"
	@echo "  make prod                            # Prod + Monitoring + ELK (with cache)"
	@echo "  make prod-detached                   # Prod + Monitoring + ELK (detached, with cache)"
	@echo ""
	@echo "Production mode (slim - no monitoring/ELK):"
	@echo "  make prod-slim                       # Prod only (with cache)"
	@echo "  make prod-slim-detached              # Prod only (detached, with cache)"
	@echo ""
	@echo "Cleanup:"
	@echo "  make down                            # Stop & remove all stacks (volumes, local images, orphans)"
	@echo "  make down-soft                       # Stop & remove containers (keep volumes/images)"
	@echo "  make clean                           # Project-scoped cleanup (containers, networks, volumes, images, artifacts)"
	@echo "  make fclean                          # clean + prune builder cache + remove builder"
	@echo "  make re                              # fclean + up"
	@echo "  make nuke CONFIRM=1                  # GLOBAL prune of ALL UNUSED Docker data (+builder cache)"
	@echo "  make overview-docker                 # Show ALL Docker resources on this machine"
	@echo ""
	@echo "Build cache (per-project builder):"
	@echo "  make builder-init                    # Create/select the per-project buildx builder"
	@echo "  make builder-use                     # Select it explicitly (current shell/session)"
	@echo "  make builder-prune                   # Prune ONLY this builder's cache"
	@echo "  make builder-rm                      # Remove the builder & its cache"
	@echo ""
	@echo "Utilities:"
	@echo "  make ps                   # Show containers (status)"
	@echo "  make logs-[service]       # Follow logs for a service"
	@echo "  make sh-[service]         # Open /bin/sh in a service"
	@echo "  make bash-[service]       # Open bash (fallback: sh) in a service"
	@echo "  make restart              # Restart all services in currently running stack (auto-detects dev/prod)"
	@echo "  make restart-[service]    # Restart a single service by name (auto-detects stack)"
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
	docker compose -p $(NAME) run --rm deps bash -lc "export COREPACK_ENABLE_DOWNLOAD_PROMPT=0 COREPACK_HOME=/tmp/corepack PATH=\$$COREPACK_HOME/shims:\$$PATH && corepack enable && pnpm install --frozen-lockfile"

build:
	@echo ">> Running pnpm build via 'deps' container"
	docker compose -p $(NAME) run --rm deps bash -lc "export COREPACK_ENABLE_DOWNLOAD_PROMPT=0 COREPACK_HOME=/tmp/corepack PATH=\$$COREPACK_HOME/shims:\$$PATH && corepack enable && pnpm run build"

typecheck:
	@echo ">> Type checking all packages via 'deps' container"
	docker compose -p $(NAME) run --rm deps bash -lc "export COREPACK_ENABLE_DOWNLOAD_PROMPT=0 COREPACK_HOME=/tmp/corepack PATH=\$$COREPACK_HOME/shims:\$$PATH && corepack enable && pnpm run typecheck"

lint:
	@echo ">> Linting all packages via 'deps' container"
	docker compose -p $(NAME) run --rm deps bash -lc "export COREPACK_ENABLE_DOWNLOAD_PROMPT=0 COREPACK_HOME=/tmp/corepack PATH=\$$COREPACK_HOME/shims:\$$PATH && corepack enable && pnpm run lint"

fmt-check:
	@echo ">> Prettier check via 'deps' container"
	docker compose -p $(NAME) run --rm deps bash -lc "export COREPACK_ENABLE_DOWNLOAD_PROMPT=0 COREPACK_HOME=/tmp/corepack PATH=\$$COREPACK_HOME/shims:\$$PATH && corepack enable && pnpm run check-format"

fmt:
	@echo ">> Prettier write via 'deps' container"
	docker compose -p $(NAME) run --rm deps bash -lc "export COREPACK_ENABLE_DOWNLOAD_PROMPT=0 COREPACK_HOME=/tmp/corepack PATH=\$$COREPACK_HOME/shims:\$$PATH && corepack enable && pnpm run fix-format"

test:
	@echo ">> Running tests via 'deps' container"
	docker compose -p $(NAME) run --rm deps bash -lc "export COREPACK_ENABLE_DOWNLOAD_PROMPT=0 COREPACK_HOME=/tmp/corepack PATH=\$$COREPACK_HOME/shims:\$$PATH && corepack enable && pnpm test"

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
