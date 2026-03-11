# Database Migrations and Seeds

Knex.js migrations and seeds for the transaction dashboard database.

## Files

- **Migration**: `db/migrations/20260305195503_init_db.ts`
  - Creates `transactions` table with columns for payment status, method, tracking IDs, etc.
  - Defines CHECK constraints for valid enum values (uppercase)

- **Seed**: `db/seeds/01_transactions.ts`
  - Truncates existing transactions
  - Generates and inserts 200 sample transaction records
  - Distributes statuses evenly across `PENDING`, `SUCCESS`, `FAILED`

## Controller Scripts

Root `knexfile.ts` defines the database connection and environment-specific databases:

- **Development**: `mydb` (default)
- **Test**: `mydb_test` (default)
- **Production**: `DATABASE_URL` or env-based connection

Connection defaults (override via env vars):

```env
DB_HOST=localhost
DB_PORT=5433
DB_USER=user
DB_PASSWORD=password
DB_NAME=mydb
```

Port guidance for local stack:

- Host access (PgAdmin, psql from macOS): `localhost:5433`
- Docker internal access (service-to-service): `postgres:5432`
- If you connect directly to a non-Docker Postgres instance, use `5432`

## Running Migrations and Seeds

From repository root:

```bash
npm run migrate:latest    # Apply all pending migrations
npm run migrate:rollback  # Rollback last batch
npm run migrate:list      # Show migration history
npm run migrate:status    # Show pending vs applied
npm run seed:run          # Run all seeds
```

Advanced Knex CLI:

```bash
npm run knex -- <command>
npm run knex -- migrate:make <name>
npm run knex -- seed:make <name>
```

## Docker Compose Behavior

When you run `docker compose up`:

1. PostgreSQL starts and becomes healthy
2. `db-init` service (one-shot) runs:
   - `npm run migrate:latest` – Applies ALL migrations
   - `npm run seed:run` – Populates with seed data
3. Dashboard API depends on `db-init` completion
4. Web Client depends on Dashboard API being healthy

This ensures the schema and data exist before services access the database.

In Compose, PostgreSQL is published as `5433:5432` (host:container).

## With Test Database

For testing, use `NODE_ENV=test`:

```bash
npm run test:db:setup     # Create test DB, migrate, seed
npm run test:db:teardown  # Rollback all migrations
```

Or use the convenience scripts:

```bash
npm run dashboard:test:coverage   # Dashboard API tests with setup/teardown
npm run web-client:test:coverage  # Web client tests with setup/teardown
```

## Schema Overview

The `transactions` table includes:

| Column | Type | Constraint |
|--------|------|-----------|
| `id` | UUID | PRIMARY KEY |
| `payment_status` | VARCHAR | CHECK IN ('PENDING', 'SUCCESS', 'FAILED') |
| `transaction_status` | VARCHAR | CHECK IN (uppercase values) |
| `payment_method` | VARCHAR | CHECK IN ('PLASTIC_CARD', 'ACH', 'PAYPAL') |
| `paygov_tracking_id` | VARCHAR | Optional |
| `paygov_token` | VARCHAR | Optional |
| `metadata` | JSONB | Optional |
| `created_at` | TIMESTAMP | Default: now |
| `updated_at` | TIMESTAMP | Default: now |

---

## See Also

- [DASHBOARD_README.md](../DASHBOARD_README.md) – Complete stack setup and testing
- [Dashboard API README](../dashboard-api/README.md)
- [Web Client README](../web-client/README.md)
