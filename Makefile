# **************************************************************************** #
#                                                                              #
#                                                         :::      ::::::::    #
#    Makefile                                           :+:      :+:    :+:    #
#                                                     +:+ +:+         +:+      #
#    By: irychkov <irychkov@student.hive.fi>        +#+  +:+       +#+         #
#                                                 +#+#+#+#+#+   +#+            #
#    Created: 2025/09/02 21:00:08 by irychkov          #+#    #+#              #
#    Updated: 2025/09/03 01:15:55 by irychkov         ###   ########.fr        #
#                                                                              #
# **************************************************************************** #

NAME=transcendence

all:
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