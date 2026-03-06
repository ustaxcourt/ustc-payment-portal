# Transaction Dashboard Local Stack (Docker + Read-Only UI)

This document explains how the local Transaction Dashboard stack works in this repository, including service startup order, database initialization, and where to find deeper documentation.

## Purpose

The dashboard stack is designed for **local development and verification** of transaction data:

- `dashboard-api` serves transaction data from PostgreSQL.
- `web-client` is a **read-only UI tool** used to inspect/filter transaction records.
- Database schema/data are managed from the **root project** migration/seed scripts.

## What Runs with `docker compose up`

`docker-compose.yml` defines the following services:

1. `postgres`
   - PostgreSQL database for transaction records.
   - Includes a healthcheck via `pg_isready`.

2. `db-init` (one-shot init service)
   - Runs from repository root.
   - Executes:
     - `npm run migrate:latest`
     - `npm run seed:run`
   - Exits after DB schema/data are initialized.

3. `dashboard-api`
   - Waits for:
     - `postgres` to be healthy
     - `db-init` to complete successfully
   - Runs in watch mode (`nodemon`) for TypeScript changes.
   - Exposes API on container port `3001`.

4. `web-client`
   - Waits for `dashboard-api` to become healthy.
   - Runs Vite dev server in watch/hot-reload mode.
   - Uses `VITE_DASHBOARD_API_BASE_URL` to call the API.

## Startup Sequence (Important)

When you run compose:

1. Postgres starts and becomes healthy.
2. `db-init` runs root migrations + seeds.
3. `dashboard-api` starts only after DB init succeeds.
4. `web-client` starts after API healthcheck passes.

This ensures UI does not load before data is available.

## Status/Data Contract Notes

Current path and status filtering are lowercase in the dashboard flow:

- API path: `/api/transactions/:paymentStatus`
- Valid `paymentStatus`: `pending`, `success`, `failed`
- Common `transactionStatus` values in seeded data:
  - `received`, `initiated`, `pending`, `processed`, `failed`

## Port Configuration

Defaults:

- API host port: `3001`
- Web UI host port: `5173`
- Postgres host port: `5432`

If ports are already in use, override at runtime:

```bash
DASHBOARD_API_PORT=3003 WEB_CLIENT_PORT=5174 docker compose up -d
```

Then use:

- API: `http://localhost:3003/api/transactions/failed`
- UI: `http://localhost:5174`

## Common Commands

### Start stack

```bash
docker compose up
```

### Start in background

```bash
docker compose up -d
```

### Recreate services after compose/script changes

```bash
docker compose up -d --force-recreate db-init dashboard-api web-client
```

### View service logs

```bash
docker compose logs -f db-init dashboard-api web-client
```

### Verify seeded data exists

```bash
curl http://localhost:3001/api/transactions/failed
```

## File Watch Behavior

Compose is configured for dev file watching:

- API container:
  - bind mounts `./dashboard-api:/app`
  - runs `nodemon` with `--legacy-watch`
  - `CHOKIDAR_USEPOLLING=true`

- Web container:
  - bind mounts `./web-client:/app`
  - runs `vite --host 0.0.0.0`
  - `CHOKIDAR_USEPOLLING=true`

This supports live reload in Docker on macOS.

## Troubleshooting

### 1) `relation "transactions" does not exist`

Cause: API started before migrations ran.

Fix:

- Ensure `db-init` is part of startup and succeeds.
- Check:

```bash
docker compose ps
docker compose logs db-init
```

### 2) API returns empty data unexpectedly

Checks:

- Confirm `db-init` seeded successfully:

```bash
docker compose logs db-init
```

- Hit endpoint directly:

```bash
curl http://localhost:3001/api/transactions/failed
```

### 3) Port already in use

Use port overrides:

```bash
DASHBOARD_API_PORT=3003 WEB_CLIENT_PORT=5174 docker compose up -d
```

### 4) Need fresh local state

```bash
docker compose down -v
docker compose up
```

## References

- Database migrations and seeding guide: [db/README.md](../db/README.md)
- Dashboard API details: [dashboard-api/README.md](../dashboard-api/README.md)
- Web client details: [web-client/README.md](../web-client/README.md)

## Scope Reminder

The web client in this project is intended as a **read-only dashboard tool** for transaction visibility and filtering during local development/integration work.
