# Transaction Dashboard API

Express API used by the transaction dashboard web client.

## Runtime and Dependencies

- Node.js `>=18.0.0`
- Express 5
- PostgreSQL (`pg`)
- Knex + Objection

## How It Runs Locally

Two common ways to run this API:

1. Docker Compose (recommended for full stack)
- Service name: `dashboard-api`
- Default host port: `3001`
- Health endpoint: `GET /health`

2. Directly from `dashboard-api/`

```bash
npm ci
npm run dev
```

When running directly, ensure Postgres is available and root migrations/seeds have been applied.

## Environment Variables

The API reads these values:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=user
DB_PASSWORD=password
DB_NAME=mydb
API_PORT=3001
NODE_ENV=development
```

For Docker Compose, `DB_HOST` is set to `postgres` in the container environment.

## Endpoints

### `GET /health`

Returns:

```json
{ "status": "ok" }
```

### `GET /api/transactions/:paymentStatus`

Valid `paymentStatus` values:

- `pending`
- `success`
- `failed`

Success response shape:

```json
{
  "data": [],
  "total": 0
}
```

Invalid status response:

```json
{
  "error": {
    "message": "Invalid paymentStatus. Expected one of: pending, success, failed"
  }
}
```

### `GET /api/transaction-payment-status`

Returns aggregated totals:

```json
{
  "success": 0,
  "failed": 0,
  "pending": 0
}
```

## Data Source and Initialization

The API reads from the root `transactions` table created by:

- Migration: `db/migrations/20260305195503_init_db.ts`
- Seed: `db/seeds/01_transactions.ts`

In Compose, this is handled by `db-init` before the API starts.

## Useful Commands

From repository root:

```bash
docker compose up
curl http://localhost:3001/health
curl http://localhost:3001/api/transactions/success
curl http://localhost:3001/api/transaction-payment-status
```

From `dashboard-api/` directory:

```bash
npm run test
npm run test:coverage
npm run lint
```

## Notes

- CORS is enabled for local development (`Access-Control-Allow-Origin: *`).
- Error middleware returns `{ error: { message } }` with status 500 for unexpected failures.
