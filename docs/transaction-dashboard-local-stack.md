# Transaction Dashboard Local Stack

This document describes the local dashboard stack based on the current `docker-compose.yml`, API behavior, and migration/seed flow in this repository.

## Purpose

The local stack is used to verify transaction dashboard behavior end-to-end:

- PostgreSQL stores transactions.
- `dashboard-api` serves read-only transaction endpoints.
- `web-client` renders tabs and DataGrid views for transaction statuses.
- Root Knex migrations and seeds initialize data.

## Services Started by Docker Compose

`docker compose up` starts these services in order:

1. `postgres`
- Image: `postgres:14`
- Host port: `5433` (container port remains `5432`)
- Env: `POSTGRES_USER=user`, `POSTGRES_PASSWORD=password`, `POSTGRES_DB=mydb`
- Healthcheck: `pg_isready -U user -d mydb`

2. `db-init` (one-shot initializer)
- Runs from repository root (`/workspace`)
- Waits for healthy `postgres`
- Runs: `npm ci && npm run migrate:latest && npm run seed:run`
- Uses DB env values with `DB_HOST=postgres` and `DB_PORT=5432`
- Exits after successful schema/data initialization

3. `dashboard-api`
- Runs from `/app` with mount `./dashboard-api:/app`
- Waits for `postgres` healthy and `db-init` success
- Runs: `npm ci && npm run dev -- --legacy-watch`
- Exposes host port `${DASHBOARD_API_PORT:-3001}`
- Healthcheck: `GET /health`

4. `web-client`
- Runs from `/app` with mount `./web-client:/app`
- Waits for healthy `dashboard-api`
- Runs: `npm ci && npm run dev -- --host 0.0.0.0 --port 5173`
- Exposes host port `${WEB_CLIENT_PORT:-5173}`
- Calls API via `VITE_DASHBOARD_API_BASE_URL=http://localhost:${DASHBOARD_API_PORT:-3001}`

## Startup Sequence

The effective startup sequence is:

1. Postgres becomes healthy.
2. `db-init` applies root migrations and seeds.
3. `dashboard-api` starts.
4. `web-client` starts.

This ordering prevents the UI/API from starting before the `transactions` table exists and has seed data.

## API and Data Contract Used by the UI

The web client fetches:

- `GET /api/transactions/:paymentStatus`
- `GET /api/transaction-payment-status`

Supported `paymentStatus` path values:

- `success`
- `failed`
- `pending`

`/api/transactions/:paymentStatus` returns:

```json
{
  "data": [],
  "total": 0
}
```

`/api/transaction-payment-status` returns counts object:

```json
{
  "success": 0,
  "failed": 0,
  "pending": 0
}
```

## Seeded Data Behavior

Current seed (`db/seeds/01_transactions.ts`) behavior:

- Deletes existing rows from `transactions`
- Inserts 200 generated rows in chunks of 50
- Rotates payment status values across `pending`, `success`, `failed`
- Populates optional fields (`paygov_tracking_id`, `paygov_token`, `metadata`) on some rows

## Useful Local Commands

Start stack in foreground:

```bash
docker compose up
```

Start stack in background:

```bash
docker compose up -d
```

Show logs:

```bash
docker compose logs -f postgres db-init dashboard-api web-client
```

Verify API quickly:

```bash
curl http://localhost:3001/health
curl http://localhost:3001/api/transactions/success
curl http://localhost:3001/api/transaction-payment-status
```

Override host ports:

```bash
DASHBOARD_API_PORT=3003 WEB_CLIENT_PORT=5174 docker compose up -d
```

Run root migrations/seeds from your shell against local Compose Postgres:

```bash
DB_PORT=5433 npm run migrate:latest
DB_PORT=5433 npm run seed:run
```

Reset local DB volume and reinitialize:

```bash
docker compose down -v
docker compose up
```

## Related Documentation

- `db/README.md`
- `dashboard-api/README.md`
- `web-client/README.md`
