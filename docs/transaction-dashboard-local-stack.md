# Transaction Dashboard Local Stack

This document describes the local dashboard stack based on the current `docker-compose.yml`, API behavior, and migration/seed flow in this repository.

## Purpose

The local stack is used to verify transaction dashboard behavior end-to-end:

- PostgreSQL stores transactions.
- `src/devServer.ts` serves read-only transaction endpoints via Express on port 8080.
- Root Knex migrations and seeds initialize data.

## Services Started by Docker Compose

`docker compose up` starts these services in order:

1. `postgres`
- Image: `postgres:14`
- Host port: `5433` (container port remains `5432`)
- Env: `POSTGRES_USER=user`, `POSTGRES_PASSWORD=password`, `POSTGRES_DB=mydb`
- Healthcheck: `pg_isready -U user -d mydb`

2. `db-init` (one-shot initializer)
- Image: `node:24`
- Runs from repository root (`/workspace`)
- Waits for healthy `postgres`
- Runs: `npm ci && npm run migrate:latest && npm run seed:run`
- Uses DB env values with `DB_HOST=postgres` and `DB_PORT=5432`
- Set `MIGRATION_MODE=1` to skip migrations/seeds (useful for debugging)
- Exits after successful schema/data initialization

## Running the Dev Server

After Docker Compose starts Postgres and seeds the database, run the Express dev server locally:

```bash
npx ts-node src/devServer.ts
```

The server starts on port 8080 and serves both the payment portal API and the dashboard transaction endpoints.

## Startup Sequence

1. Postgres becomes healthy.
2. `db-init` applies root migrations and seeds.
3. Run `npx ts-node src/devServer.ts` to start the API on port 8080.

This ordering prevents the API from starting before the `transactions` table exists and has seed data.

## API Endpoints

The dashboard API serves the following endpoints:

- `GET /transactions` — all transactions (max 100)
- `GET /transactions/:paymentStatus` — transactions filtered by status
- `GET /transaction-payment-status` — aggregated counts

Supported `paymentStatus` path values:

- `success`
- `failed`
- `pending`

`/transactions` and `/transactions/:paymentStatus` return:

```json
{
  "data": [],
  "total": 0
}
```

`/transaction-payment-status` returns counts object:

```json
{
  "success": 0,
  "failed": 0,
  "pending": 0,
  "total": 0
}
```

## Seeded Data Behavior

Current seed (`db/seeds/01_transactions.ts`) behavior:

- Deletes existing rows from `transactions`
- Inserts 200 generated rows in chunks of 50
- Rotates payment status values across `pending`, `success`, `failed`
- Populates optional fields (`paygov_tracking_id`, `paygov_token`, `metadata`) on some rows

## Useful Local Commands

Start Postgres and seed the database:

```bash
docker compose up
```

Start Postgres in the background:

```bash
docker compose up -d
```

Run the dev server (after Postgres is running):

```bash
npx ts-node src/devServer.ts
```

Show Docker logs:

```bash
docker compose logs -f postgres db-init
```

Verify API quickly:

```bash
curl http://localhost:8080/transactions
curl http://localhost:8080/transactions/success
curl http://localhost:8080/transaction-payment-status
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
