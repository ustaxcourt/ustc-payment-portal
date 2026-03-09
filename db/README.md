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

Environment-specific database selection:

- `development`: `DB_NAME` (default `mydb`)
- `test`: `${DB_NAME}_test` (default `mydb_test`)
- `production`: `DATABASE_URL` if provided, else the same env-based connection object

## Root Scripts

From repository root:

```bash
npm run migrate:latest
npm run migrate:rollback
npm run migrate:list
npm run seed:run
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

## Test Database Setup

Dashboard API test scripts use root `test:db:setup`, which now ensures the test DB exists before migrations:

```bash
npm run test:db:setup
```

Behavior:

1. Runs `scripts/ensure-test-db.js` to create `${DB_NAME}_test` if missing.
2. Runs test migrations (`NODE_ENV=test npm run knex -- migrate:latest`).
3. Runs test seed (`NODE_ENV=test npm run knex -- seed:run`).

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

`ECONNREFUSED 127.0.0.1:5432`

- Start Postgres via Compose:

```bash
docker compose up
```
