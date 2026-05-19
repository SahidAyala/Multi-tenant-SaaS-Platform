#!/usr/bin/env bash
set -euo pipefail

# ATLAS — Development Environment Setup Script
# Usage: ./infra/scripts/setup-dev.sh

BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${BLUE}[setup]${NC} $*"; }
ok()  { echo -e "${GREEN}[ok]${NC} $*"; }
err() { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

# Check prerequisites
command -v node >/dev/null 2>&1 || err "Node.js not found. Install v20+."
command -v pnpm >/dev/null 2>&1 || err "pnpm not found. Run: corepack enable && corepack prepare pnpm@latest --activate"
command -v docker >/dev/null 2>&1 || err "Docker not found."
command -v docker compose >/dev/null 2>&1 || err "Docker Compose not found."

NODE_VERSION=$(node --version | cut -d. -f1 | tr -d 'v')
[[ "$NODE_VERSION" -lt 20 ]] && err "Node.js v20+ required. Current: $(node --version)"

log "Installing dependencies via pnpm..."
pnpm install --frozen-lockfile

log "Copying .env.example to .env (if not exists)..."
[[ -f .env ]] || cp .env.example .env

log "Starting infrastructure containers..."
docker compose up -d postgres redis

log "Waiting for PostgreSQL to be ready..."
until docker compose exec -T postgres pg_isready -U atlas -d atlas_dev >/dev/null 2>&1; do
  sleep 1
done
ok "PostgreSQL is ready"

log "Waiting for Redis to be ready..."
until docker compose exec -T redis redis-cli ping >/dev/null 2>&1; do
  sleep 1
done
ok "Redis is ready"

log "Running database migrations..."
pnpm run migration:run

ok "Setup complete! Run 'make dev' or 'pnpm run start:dev' to start the API."
