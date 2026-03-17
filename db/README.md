# Database Migrations and Seeds

This folder contains the migration and seed files used by the root Knex configuration (`knexfile.ts`).

## Current Schema and Seed Files

- Migration: `db/migrations/20260305195503_init_db.ts`
- Seed: `db/seeds/01_transactions.ts`

The migration creates the `transactions` table, constraints, and indexes.
The seed deletes existing rows and inserts 200 generated transaction records.

## Connection Configuration

Root `knexfile.ts` uses these defaults when env vars are not set:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=user
DB_PASSWORD=password
DB_NAME=mydb
```

When running Postgres through `docker compose`, the host maps to `localhost:5433`.
Use `DB_PORT=5433` for commands run from your local shell.
Use the same host/port in PgAdmin: `localhost:5433`.

Environment-specific database selection:

- `development`: `DB_NAME` (default `mydb`)
- `test`: `${DB_NAME}_test` (default `mydb_test`)
- `production`: `DATABASE_URL` if provided, else the same env-based connection object

## Root Scripts

From repository root:

```bash
DB_PORT=5433 npm run migrate:latest
DB_PORT=5433 npm run migrate:rollback
DB_PORT=5433 npm run migrate:list
DB_PORT=5433 npm run seed:run
```

Knex CLI wrapper script:

```bash
npm run knex -- <knex-command>
```

## Docker Compose Behavior

`docker compose up` includes a one-shot `db-init` service that runs:

```bash
npm ci && npm run migrate:latest && npm run seed:run
```

Inside Compose, `db-init` uses:

- `DB_HOST=postgres`
- `DB_PORT=5432`
- `DB_USER=user`
- `DB_PASSWORD=password`
- `DB_NAME=mydb`

This initializes schema and seed data before `dashboard-api` starts.
This is correct for container-to-container networking (`db-init` to `postgres`).

## Test Database Setup

Dashboard API test scripts use root `test:db:setup`, which now ensures the test DB exists before migrations:

```bash
npm run test:db:setup
```

Behavior:

1. Runs `scripts/ensure-test-db.js` to create `${DB_NAME}_test` if missing.
2. Runs test migrations (`DB_PORT=5433 NODE_ENV=test npm run knex -- migrate:latest`) when invoked from local shell.
3. Runs test seed (`DB_PORT=5433 NODE_ENV=test npm run knex -- seed:run`) when invoked from local shell.

If your test database is running in local Compose, include `DB_PORT=5433` when running these from your shell.

This setup is used by:

- `npm run dashboard:test`
- `npm run dashboard:test:coverage`

## Typical Local Workflow

1. Start stack:

```bash
docker compose up
```

2. Verify API has data:

```bash
curl http://localhost:3001/api/transactions/success
```

3. For test runs that require test DB setup:

```bash
npm run dashboard:test:coverage
```

## Troubleshooting

`database "mydb_test" does not exist`

- Run `npm run test:db:setup` (it creates the test DB automatically).

`relation "transactions" does not exist`

- Check `db-init` logs and ensure migrations completed.

```bash
docker compose logs db-init
```

`ECONNREFUSED 127.0.0.1:5433`

- Start Postgres via Compose:

```bash
docker compose up
```

- Run migrations/seeds from shell using host-mapped port:

```bash
DB_PORT=5433 npm run migrate:latest
DB_PORT=5433 npm run seed:run
```
