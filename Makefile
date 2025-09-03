# **************************************************************************** #
#                                                                              #
#                                                         :::      ::::::::    #
#    Makefile                                           :+:      :+:    :+:    #
#                                                     +:+ +:+         +:+      #
#    By: irychkov <irychkov@student.hive.fi>        +#+  +:+       +#+         #
#                                                 +#+#+#+#+#+   +#+            #
#    Created: 2025/09/02 21:00:08 by irychkov          #+#    #+#              #
#    Updated: 2025/09/03 13:23:07 by irychkov         ###   ########.fr        #
#                                                                              #
# **************************************************************************** #

NAME=transcendence

SERVICES=backend frontend nginx

all:
	if [ ! -d "./backend/data/sqlite/uploads" ]; then \
		mkdir -p ./backend/data/sqlite/uploads; \
	fi
	docker compose -p $(NAME) -f docker-compose.yml --env-file .env up --build
	
detached:
	if [ ! -d "./backend/data/sqlite/uploads" ]; then \
		mkdir -p ./backend/data/sqlite/uploads; \
	fi
	docker compose -p $(NAME) -f docker-compose.yml --env-file .env up --build -d

down:
	docker compose -p $(NAME) -f docker-compose.yml down --remove-orphans

fclean:
	docker compose -p $(NAME) -f docker-compose.yml --env-file .env down --rmi local --volumes --remove-orphans
	docker system prune -a -f --volumes --filter "label=project=$(NAME)"
	@if [ -d "./backend/data" ]; then \
		rm -rf ./backend/data; \
	fi

re: fclean all

# --------------------------
# Default target: show usage
# --------------------------
help:
	@echo "Usage:"
	@echo "  make                      # Build & start all services"
	@echo "  make detached             # Build & start all services in detached mode"
	@echo "  make all                  # Build & start all services"
	@echo "  make down                 # Stop all services and remove containers"
	@echo "  make fclean               # Stop and remove all services, volumes, images"
	@echo "  make re                   # fclean + all"
	@echo ""
	@echo "Service commands:"
	@echo "  make logs-[service]       # Follow logs for service (backend, frontend, nginx)"
	@echo "  make sh-[service]         # Open sh shell in service"
	@echo "  make bash-[service]       # Open bash shell in service"
	@echo "  make restart-[service]    # Restart single service"
	@echo "  make restart              # Restart all services"
	@echo "  make stop                 # Stop all services without removing them"
	@echo ""
	@echo "Available services: $(SERVICES)"

# ========================
#  Logs & utilities
# ========================

# ==[LOGS]========================================================================
logs-%:
	@if echo "$(SERVICES)" | grep -qw "$*"; then \
		docker logs -f dev_$*; \
	else \
		echo "Usage: make logs-[service]"; \
		echo "Available services: $(SERVICES)"; \
	fi

# ==[Running containers]==========================================================
ps:
	docker compose -p $(NAME) -f docker-compose.yml ps

# ==[Access to containers SHELL]==================================================
sh-%:
	@if echo "$(SERVICES)" | grep -qw "$*"; then \
		docker exec -it dev_$* sh; \
	else \
		echo "Usage: make sh-[service]"; \
		echo "Available services: $(SERVICES)"; \
	fi

# ==[Access to containers BASH]===================================================
bash-%:
	@if echo "$(SERVICES)" | grep -qw "$*"; then \
		docker exec -it dev_$* bash || docker exec -it dev_$* sh; \
	else \
		echo "Usage: make bash-[service]"; \
		echo "Available services: $(SERVICES)"; \
	fi

# ==[Stop containers without removing them]========================================
stop:
	docker compose -p $(NAME) -f docker-compose.yml stop

# ==[Restart containers]==========================================================
restart:
	docker compose -p $(NAME) -f docker-compose.yml restart

# ==[Restart one service]=========================================================
restart-%:
	@if echo "$(SERVICES)" | grep -qw "$*"; then \
		docker compose -p $(NAME) -f docker-compose.yml restart $*; \
	else \
		echo "Usage: make restart-[service]"; \
		echo "Available services: $(SERVICES)"; \
	fi

# Catch-all for unknown targets
%:
	@echo "Unknown command: $@"
	@$(MAKE) help

.PHONY: all detached down fclean re ps logs-% sh-% bash-% stop restart restart-%