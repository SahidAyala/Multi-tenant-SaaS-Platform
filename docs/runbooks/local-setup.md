# Local Development Setup

## Prerequisites

- Node.js >= 20 (`nvm use 20`)
- pnpm >= 10 (`corepack enable && corepack prepare pnpm@latest --activate`)
- Docker + Docker Compose
- GNU Make

## First-Time Setup

```bash
# 1. Clone e instalar
git clone <repo>
cd Multi-tenant-SaaS-Platform
pnpm install

# 2. Copy environment config
cp .env.example .env
# Edit .env — defaults work for local Docker setup

# 3. Start infrastructure (postgres + redis)
make infra

# 4. Wait for services to be healthy, then run migrations
make migrate

# 5. Start API in watch mode
make dev
```

The API will be available at `http://localhost:3000`.
Health check: `http://localhost:3000/health`

## Start With GUI Tools

```bash
# Start Postgres + Redis + pgAdmin + RedisInsight
make infra-tools

# pgAdmin: http://localhost:5050 (admin@atlas.local / admin)
# RedisInsight: http://localhost:5540
```

## Running Tests

```bash
make test          # Unit tests
make test-cov      # Coverage report
```

## Database Operations

```bash
make db-shell                   # psql shell
make migrate                    # Run pending migrations
make migrate-generate NAME=AddProjectTable  # Generate migration
make migrate-revert             # Revert last migration
```

## Common Issues

### Port already in use
```bash
lsof -ti:5432 | xargs kill  # Kill process using Postgres port
lsof -ti:6379 | xargs kill  # Kill process using Redis port
```

### Migration fails
```bash
make db-shell
# In psql:
SELECT * FROM atlas_migrations ORDER BY timestamp DESC LIMIT 10;
```

### Redis connection refused
```bash
docker compose ps redis
docker compose logs redis
```

## Environment Variables Reference

See `.env.example` for the full list. Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `EVENT_BUS_ADAPTER` | `memory` | `memory` or `redis-streams` |
| `DB_HOST` | `localhost` | PostgreSQL host |
| `REDIS_HOST` | `localhost` | Redis host |
| `JWT_SECRET` | (see .env.example) | Must be changed in production |
| `LOG_LEVEL` | `debug` | `debug`, `info`, `warn`, `error` |

## Module Boundaries

When adding code, follow these rules:

1. **Never** import from another module's `domain/` folder
2. **Always** communicate cross-module via `IEventBus` events or exposed service interfaces
3. **Always** add `tenantId` to new database entities
4. **Always** record audit events for state-mutating operations
5. **Always** propagate `correlationId` from the incoming command

## Adding a New Domain Module

```bash
mkdir -p apps/api/src/modules/{name}/domain/{entities,value-objects,repositories}
mkdir -p apps/api/src/modules/{name}/application/{commands,queries}
mkdir -p apps/api/src/modules/{name}/infrastructure/persistence
mkdir -p apps/api/src/modules/{name}/api
```

Then:
1. Create ORM entity implementing `tenant_id`
2. Create domain entity/aggregate extending `Entity` or `AggregateRoot`
3. Create repository port (interface)
4. Create TypeORM repository implementation
5. Add ORM entity to `AppModule` entities array
6. Register module in `AppModule`
7. Add event contracts to `libs/event-contracts` if cross-domain events are needed
8. Create migration: `make migrate-generate NAME=Create{Entity}Table`
