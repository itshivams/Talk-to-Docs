SHELL := /bin/sh

.PHONY: up down logs ps build fmt

up:
	docker compose up --build

down:
	docker compose down

logs:
	docker compose logs -f

ps:
	docker compose ps

build:
	docker compose build

fmt:
	gofmt -w services/api-gateway services/auth-service services/session-service
