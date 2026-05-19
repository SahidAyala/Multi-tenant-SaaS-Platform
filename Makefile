.PHONY: help install dev stop logs clean test migrate seed

DOCKER_COMPOSE = docker compose
PNPM = pnpm

help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n\nTargets:\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

# ----------------------------------------------------------
# Local Development
# ----------------------------------------------------------

install: ## Install dependencies
	$(PNPM) ci

infra: ## Start infrastructure only (postgres, redis)
	$(DOCKER_COMPOSE) up -d postgres redis

infra-tools: ## Start infrastructure + GUI tools
	$(DOCKER_COMPOSE) --profile tools up -d

dev: infra ## Start infrastructure + watch mode API
	$(PNPM) run start:dev

dev-docker: ## Start everything in Docker (including API)
	$(DOCKER_COMPOSE) --profile app up -d

stop: ## Stop all containers
	$(DOCKER_COMPOSE) down

stop-clean: ## Stop containers and remove volumes
	$(DOCKER_COMPOSE) down -v

logs: ## Tail API logs
	$(DOCKER_COMPOSE) logs -f api

# ----------------------------------------------------------
# Database
# ----------------------------------------------------------

migrate: ## Run pending migrations
	$(PNPM) run migration:run

migrate-generate: ## Generate a new migration (NAME=MigrationName)
	$(PNPM) run migration:generate -- database/migrations/$(NAME)

migrate-revert: ## Revert last migration
	$(PNPM) run migration:revert

db-shell: ## Open psql shell
	$(DOCKER_COMPOSE) exec postgres psql -U atlas -d atlas_dev

# ----------------------------------------------------------
# Build & Test
# ----------------------------------------------------------

build: ## Build the API
	$(PNPM) run build

test: ## Run unit tests
	$(PNPM) run test

test-cov: ## Run tests with coverage
	$(PNPM) run test:cov

test-e2e: ## Run end-to-end tests
	$(PNPM) run test:e2e

lint: ## Run linter
	$(PNPM) run lint

format: ## Run formatter
	$(PNPM) run format

# ----------------------------------------------------------
# Docker
# ----------------------------------------------------------

docker-build: ## Build production Docker image
	docker build --target production -t atlas-api:latest .

docker-push: ## Push to ECR (requires AWS_ACCOUNT_ID, AWS_REGION)
	aws ecr get-login-password --region $(AWS_REGION) | \
		docker login --username AWS --password-stdin $(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com
	docker tag atlas-api:latest $(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com/atlas-api:latest
	docker push $(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com/atlas-api:latest

# ----------------------------------------------------------
# Terraform
# ----------------------------------------------------------

tf-init: ## Terraform init (ENV=dev)
	cd infra/terraform/environments/$(ENV) && terraform init

tf-plan: ## Terraform plan (ENV=dev)
	cd infra/terraform/environments/$(ENV) && terraform plan

tf-apply: ## Terraform apply (ENV=dev)
	cd infra/terraform/environments/$(ENV) && terraform apply

clean: ## Remove build artifacts
	rm -rf dist coverage node_modules
