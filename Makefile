# **************************************************************************** #
#                                                                              #
#                                                         :::      ::::::::    #
#    Makefile                                           :+:      :+:    :+:    #
#                                                     +:+ +:+         +:+      #
#    By: ft_transcendence                            +#+  +:+       +#+         #
#                                                 +#+#+#+#+#+   +#+            #
#    Created: 2025/09/12                               #+#    #+#              #
#    Updated: 2025/09/12                               ###   ########.fr        #
#                                                                              #
# **************************************************************************** #

# Project / compose
NAME            ?= ft-transcendence-dev
ROOT_COMPOSE     = -f docker-compose.yml
ELK_COMPOSE      = -f docker-compose.yml -f log-management/docker-compose.yml

# Env files
ENV_ROOT         = --env-file .env
ENV_ELK          = --env-file log-management/.env

# Known services (for helper targets)
SERVICES         = deps frontend backend nginx elastic_cert_setup elasticsearch kibana kibana-post logstash

# Ensure required bind-mount directories exist
define ensure_dirs
	@if [ ! -d "./apps/backend/data/sqlite/uploads" ]; then \
		mkdir -p ./apps/backend/data/sqlite/uploads; \
	fi
endef

# --------------------------
# Default target: show usage
# --------------------------
.PHONY: help
help:
	@echo "Usage:"
	@echo "  make / make up            # Build & start root stack (frontend, backend, nginx)"
	@echo "  make detached             # Same, detached (-d)"
	@echo "  make elk                  # Root stack + ELK (profile: elk)"
	@echo "  make elk-detached         # Same, detached"
	@echo "  make down                 # Stop & remove root stack"
	@echo "  make down-elk             # Stop & remove ELK stack"
	@echo "  make fclean               # Stop & remove EVERYTHING (root+ELK, volumes, images)"
	@echo "  make re                   # fclean + up"
	@echo ""
	@echo "Utilities:"
	@echo "  make ps                   # Show containers"
	@echo "  make logs-[service]       # Follow logs for a service"
	@echo "  make sh-[service]         # Open sh in a service"
	@echo "  make bash-[service]       # Open bash (fallback to sh) in a service"
	@echo "  make restart              # Restart root stack services"
	@echo "  make restart-elk          # Restart ELK services"
	@echo "  make restart-[service]    # Restart single service"
	@echo "  make stop                 # Stop all containers for this project"
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
	@echo "  make db-reset             # wipe backend ./apps/backend/data"

# ========================
#  Orchestration
# ========================
.PHONY: all up detached elk elk-detached down down-elk fclean re stop restart restart-elk restart-%
all: up

up:
	$(ensure_dirs)
	docker compose -p $(NAME) $(ROOT_COMPOSE) $(ENV_ROOT) up --build

detached:
	$(ensure_dirs)
	docker compose -p $(NAME) $(ROOT_COMPOSE) $(ENV_ROOT) up --build -d

elk:
	$(ensure_dirs)
	docker compose -p $(NAME) $(ELK_COMPOSE) $(ENV_ELK) --profile elk up --build

elk-detached:
	$(ensure_dirs)
	docker compose -p $(NAME) $(ELK_COMPOSE) $(ENV_ELK) --profile elk up --build -d

down:
	docker compose -p $(NAME) $(ROOT_COMPOSE) $(ENV_ROOT) down --remove-orphans

down-elk:
	docker compose -p $(NAME) $(ELK_COMPOSE) $(ENV_ELK) --profile elk down --remove-orphans

fclean:
	-$(MAKE) down
	-$(MAKE) down-elk
	# Prune images/volumes tagged by either project label or dangling (best effort)
	-docker system prune -a -f --volumes --filter "label=project=$(NAME)"
	-docker system prune -a -f --volumes --filter "label=project=transcendence"
	@if [ -d "./apps/backend/data" ]; then rm -rf ./apps/backend/data; fi

re: fclean up

stop:
	# Stop all containers in the compose project (root + ELK included)
	docker compose -p $(NAME) stop

restart:
	docker compose -p $(NAME) $(ROOT_COMPOSE) $(ENV_ROOT) restart

restart-elk:
	docker compose -p $(NAME) $(ELK_COMPOSE) $(ENV_ELK) --profile elk restart

restart-%:
	@if echo "$(SERVICES)" | grep -qw "$*"; then \
		docker compose -p $(NAME) -f docker-compose.yml restart $* || true; \
		docker compose -p $(NAME) -f log-management/docker-compose.yml --env-file log-management/.env restart $* || true; \
	else \
		echo "Usage: make restart-[service]"; \
		echo "Available services: $(SERVICES)"; \
	fi

# ========================
#  Logs & utilities
# ========================
.PHONY: ps logs-% sh-% bash-%
ps:
	docker compose -p $(NAME) ps

logs-%:
	@if echo "$(SERVICES)" | grep -qw "$*"; then \
		docker compose -p $(NAME) logs -f $*; \
	else \
		echo "Usage: make logs-[service]"; \
		echo "Available services: $(SERVICES)"; \
	fi

sh-%:
	@if echo "$(SERVICES)" | grep -qw "$*"; then \
		docker compose -p $(NAME) exec -it $* sh; \
	else \
		echo "Usage: make sh-[service]"; \
		echo "Available services: $(SERVICES)"; \
	fi

bash-%:
	@if echo "$(SERVICES)" | grep -qw "$*"; then \
		docker compose -p $(NAME) exec -it $* bash || docker compose -p $(NAME) exec -it $* sh; \
	else \
		echo "Usage: make bash-[service]"; \
		echo "Available services: $(SERVICES)"; \
	fi

# ========================
#  Repo tasks (pnpm via deps svc)
# ========================
.PHONY: pnpm-install build typecheck lint fmt-check fmt test migrate db-reset

pnpm-install:
	docker compose -p $(NAME) run --rm deps bash -lc "corepack enable && corepack prepare pnpm@9.12.3 --activate && pnpm install --frozen-lockfile"

build:
	docker compose -p $(NAME) run --rm deps bash -lc "corepack enable && corepack prepare pnpm@9.12.3 --activate && pnpm run build"

typecheck:
	docker compose -p $(NAME) run --rm deps bash -lc "corepack enable && corepack prepare pnpm@9.12.3 --activate && pnpm run typecheck"

lint:
	docker compose -p $(NAME) run --rm deps bash -lc "corepack enable && corepack prepare pnpm@9.12.3 --activate && pnpm run lint"

fmt-check:
	docker compose -p $(NAME) run --rm deps bash -lc "corepack enable && corepack prepare pnpm@9.12.3 --activate && pnpm run check-format"

fmt:
	docker compose -p $(NAME) run --rm deps bash -lc "corepack enable && corepack prepare pnpm@9.12.3 --activate && pnpm run fix-format"

test:
	docker compose -p $(NAME) run --rm deps bash -lc "corepack enable && corepack prepare pnpm@9.12.3 --activate && pnpm test"

migrate:
	docker compose -p $(NAME) run --rm backend bash -lc "pnpm migrate"

db-reset:
	@if [ -d "./apps/backend/data" ]; then rm -rf ./apps/backend/data; fi
