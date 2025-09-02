# **************************************************************************** #
#                                                                              #
#                                                         :::      ::::::::    #
#    Makefile                                           :+:      :+:    :+:    #
#                                                     +:+ +:+         +:+      #
#    By: irychkov <irychkov@student.hive.fi>        +#+  +:+       +#+         #
#                                                 +#+#+#+#+#+   +#+            #
#    Created: 2025/09/02 21:00:08 by irychkov          #+#    #+#              #
#    Updated: 2025/09/03 01:32:20 by irychkov         ###   ########.fr        #
#                                                                              #
# **************************************************************************** #

NAME=transcendence

all:
	if [ ! -d "./backend/data/sqlite/uploads" ]; then \
		mkdir -p ./backend/data/sqlite/uploads; \
	fi
	docker compose -p $(NAME) -f docker-compose.yml --env-file .env up --build

down:
	docker compose -p $(NAME) -f docker-compose.yml down --remove-orphans

fclean:
	docker compose -p $(NAME) -f docker-compose.yml --env-file .env down --rmi local --volumes --remove-orphans
	docker system prune -a -f --volumes --filter "label=project=$(NAME)"
	@if [ -d "./backend/data" ]; then \
		rm -rf ./backend/data; \
	fi

re: fclean all

.PHONY: all down fclean re