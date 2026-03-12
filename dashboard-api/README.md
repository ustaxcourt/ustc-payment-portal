# Dashboard API

Express API serving transaction data to the web client.

## Quick Reference

- **Language**: TypeScript
- **Framework**: Express 5
- **ORM**: Objection.js + Knex
- **Database**: PostgreSQL 14
- **Port**: `3001`
- **Node**: `>=18.0.0`

## Running the API

### With Docker Compose (recommended)

See [DASHBOARD_README.md](../DASHBOARD_README.md) for full stack setup:

```bash
docker compose up
```

### Standalone Development

From `dashboard-api/`:

```bash
npm ci
npm run dev
```

**Prerequisites**:
- PostgreSQL running on `localhost:5433` when using Docker Compose (host access)
- Use `postgres:5432` when connecting from inside Docker containers
- Root migrations applied: `DB_PORT=5433 npm run migrate:latest` (from repo root)
- Seeds populated: `DB_PORT=5433 npm run seed:run` (from repo root)

## Environment Variables

```env
DB_HOST=localhost        # Default: localhost
DB_PORT=5433            # Default for host access with Docker Compose Postgres
DB_USER=user            # Default: user
DB_PASSWORD=password    # Default: password
DB_NAME=mydb            # Default: mydb
NODE_ENV=development    # development | test | production
```

Port guidance:

- Host tools (PgAdmin, psql on your machine) with Docker Compose: `localhost:5433`
- Container-to-container (`dashboard-api` -> `postgres`): `postgres:5432`

## API Endpoints

### `GET /health`

Health check endpoint.

**Response**:
```json
{ "status": "ok" }
```

### `GET /api/transactions/:status`

Fetch transactions by status.

**Path Parameters**:
- `:status` – One of: `success`, `failed`, `pending` (lowercase)

**Success Response**:
```json
{
  "data": [
    {
      "id": "uuid",
      "payment_status": "SUCCESS",
      "payment_method": "PLASTIC_CARD",
      "paygov_tracking_id": "optional",
      "paygov_token": "optional",
      "metadata": {}
    }
  ],
  "total": 0
}
```

**Error Response** (invalid status):
```json
{
  "error": {
    "message": "Invalid paymentStatus. Expected one of: success, failed, pending"
  }
}
```

### `GET /api/transaction-payment-status`

Fetch aggregate status counts.

**Response**:
```json
{
  "success": 67,
  "failed": 67,
  "pending": 66
}
```

---

## Testing

From `dashboard-api/`:

```bash
npm run test              # Run tests
npm run test:coverage     # Run with coverage report
npm run test:watch       # Watch mode
```

Or from repository root:

```bash
npm run dashboard:test           # Tests with DB setup/teardown
npm run dashboard:test:coverage  # Coverage with DB setup/teardown
```

---

## Data Initialization

The API reads from the `transactions` table created by:

- **Migration**: `db/migrations/20260305195503_init_db.ts`
- **Seed**: `db/seeds/01_transactions.ts`

When using Docker Compose, the `db-init` service handles this before the API starts.

---

## Development Notes

- **CORS**: Enabled for local development (`Access-Control-Allow-Origin: *`)
- **Errors**: Middleware returns `{ error: { message } }` with appropriate HTTP status
- **Case Conversion**: Accepts lowercase path parameters and converts them to uppercase for database queries

---

## See Also

- [DASHBOARD_README.md](../DASHBOARD_README.md) – Complete stack setup and testing guide
- [Database README](../db/README.md) – Migrations and seeds
- [Web Client README](../web-client/README.md)
