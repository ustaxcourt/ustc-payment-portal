# Transaction Dashboard Setup & Development

Complete guide to running and testing the transaction dashboard stack locally.

## Quick Start

### Setup Stack (Docker Compose)

```bash
docker compose up
```

This starts PostgreSQL, initializes the database, and launches the dashboard API and web client.

### Initialize Database (Manual Setup)

If running services separately:

```bash
DB_PORT=5433 npm run migrate:latest
DB_PORT=5433 npm run seed:run
```

### Access the Application

- **Web Client**: http://localhost:5173
- **Dashboard API**: http://localhost:3001
- **Health Check**: `curl http://localhost:3001/health`

---

## Stack Overview

The local transaction dashboard stack consists of:

1. **PostgreSQL Database** (host port 5433, container port 5432) – Stores transactions
2. **Dashboard API** (port 3001) – Express API serving transaction data
3. **Web Client** (port 5173) – React UI displaying transactions by status

These services are orchestrated by `docker-compose.yml` and coordinate through migrations, seeds, and environment configuration.

---

## Services and Configuration

### PostgreSQL

- **Image**: `postgres:14`
- **Host Port (external)**: `5433` (use this from PgAdmin or your host machine)
- **Container Port (internal Docker network)**: `5432` (use this from other containers)
- **Credentials**:
  - User: `user`
  - Password: `password`
  - Database: `mydb`
- **Healthcheck**: Monitors connection readiness
- **Volume**: `postgres_data` (persists between restarts)

### Dashboard API

- **Working Directory**: `/app` (mounted from `./dashboard-api`)
- **Port**: `3001` (configurable via `DASHBOARD_API_PORT`)
- **Start Command**: `npm ci && npm run dev -- --legacy-watch`
- **Dependencies**: Depends on `postgres` healthy
- **Environment**:
  ```env
  DB_HOST=postgres
  DB_PORT=5432
  DB_USER=user
  DB_PASSWORD=password
  DB_NAME=mydb
  NODE_ENV=development
  ```

`DB_PORT=5432` is correct for the API because it connects over the internal Docker network.

### Web Client

- **Working Directory**: `/app` (mounted from `./web-client`)
- **Port**: `5173` (configurable via `WEB_CLIENT_PORT`)
- **Start Command**: `npm ci && npm run dev -- --host 0.0.0.0 --port 5173`
- **Dependencies**: Depends on `dashboard-api` healthy
- **Environment**:
  ```env
  VITE_DASHBOARD_API_BASE_URL=http://localhost:3001
  ```

---

## Startup Sequence

When you run `docker compose up`:

1. **PostgreSQL starts** and becomes healthy
2. **Database initializes** (via one-shot `db-init` service):
   - `npm ci`
   - `npm run migrate:latest` – Applies all migrations
   - `npm run seed:run` – Populates with 200 transactions
3. **Dashboard API starts** and becomes healthy
4. **Web Client starts** and is ready for use

This ordering ensures the database schema and seed data exist before the API or UI attempts to query them.

---

## Database Schema

The migration (`db/migrations/20260305195503_init_db.ts`) creates:

- **`transactions` table** with columns:
  - `id` (UUID primary key)
  - `payment_status` (PENDING, SUCCESS, FAILED)
  - `transaction_status` (3 uppercase values with check constraint)
  - `payment_method` (PLASTIC_CARD, ACH, PAYPAL)
  - Additional tracking fields (`paygov_tracking_id`, `paygov_token`, `metadata`)

- **Check Constraints**:
  - `payment_status` values: `PENDING`, `SUCCESS`, `FAILED`
  - `payment_method` values: `PLASTIC_CARD`, `ACH`, `PAYPAL`
  - `transaction_status` values: uppercase per spec

---

## API Contract

### Endpoints

The web client calls these endpoints on the dashboard-api:

#### `GET /api/transactions/:status`

Fetch transactions by status.

**Path Parameters**:
- `:status` – One of: `success`, `failed`, `pending` (lowercase)

**Response**:
```json
{
  "data": [
    {
      "id": "uuid",
      "payment_status": "SUCCESS",
      "transaction_status": "COMPLETED",
      "payment_method": "PLASTIC_CARD",
      "paygov_tracking_id": "optional",
      "paygov_token": "optional",
      "metadata": {}
    }
  ],
  "total": 1
}
```

#### `GET /api/transaction-payment-status`

Fetch aggregate status counts.

**Response**:
```json
{
  "success": 67,
  "failed": 67,
  "pending": 66
}
```

**Note**: The API accepts lowercase path parameters (e.g., `/api/transactions/success`) but internally converts them to uppercase (`SUCCESS`) for database queries.

---

## Seed Data

Current seed (`db/seeds/01_transactions.ts`):

- Deletes existing transaction rows
- Inserts 200 generated transaction records
- Distributes statuses evenly across `pending`, `success`, `failed`
- Populates optional fields (`paygov_tracking_id`, `paygov_token`, `metadata`) on some rows
- Uses Faker.js for realistic data generation

---

## Testing

### Run All Tests with Database Setup and Teardown

#### Dashboard API Tests

```bash
npm run dashboard:test:coverage
```

This script:
1. Sets up test database (`test:db:setup`)
2. Runs coverage tests (`npm run --prefix dashboard-api test:coverage`)
3. Tears down migrations (`test:db:teardown` – rollback all)

#### Web Client Tests

```bash
npm run web-client:test:coverage
```

Runs Cypress e2e test coverage for the web client.

### Individual Test Scripts

| Command | Purpose |
| --- | --- |
| `npm run test:db:setup` | Create test database, run migrations, seed data |
| `npm run test:db:teardown` | Rollback all migrations (cleanup) |
| `npm run dashboard:test` | Dashboard API tests with setup/teardown |
| `npm run dashboard:test:coverage` | Dashboard API tests + coverage report with setup/teardown |
| `npm run web-client:test` | Cypress e2e tests |
| `npm run web-client:test:coverage` | Cypress e2e tests with coverage |

---

## Common Local Commands

### Docker Compose Management

```bash
# Start in foreground (see all logs)
docker compose up

# Start in background
docker compose up -d

# View logs
docker compose logs -f postgres db-init dashboard-api web-client

# Stop services
docker compose down

# Stop and remove volumes (reset database)
docker compose down -v
```

### Verify Stack Health

```bash
# API health check
curl http://localhost:3001/health

# Transaction data endpoint
curl http://localhost:3001/api/transactions/success

# Status counts
curl http://localhost:3001/api/transaction-payment-status
```

### Override Service Ports

```bash
# Use custom ports for API and web client
DASHBOARD_API_PORT=3003 WEB_CLIENT_PORT=5174 docker compose up
```

### Database Operations (Root Level)

```bash
DB_PORT=5433 npm run migrate:latest    # Apply pending migrations
DB_PORT=5433 npm run migrate:rollback  # Rollback last batch
DB_PORT=5433 npm run migrate:list      # Show migration history
DB_PORT=5433 npm run seed:run          # Run seeds
```

PostgreSQL connection note:

- From your host (PgAdmin, psql on macOS): use `localhost:5433`
- From containers (e.g., `dashboard-api` -> `postgres`): use `postgres:5432`

### Root Knex CLI

For advanced operations:

```bash
DB_PORT=5433 npm run knex -- <command>
```

Examples:
```bash
DB_PORT=5433 npm run knex -- migrate:status
DB_PORT=5433 npm run knex -- seed:make create_transactions
```

---

## Environment Configuration

### Local `.env` Files

No third-party dotenv library is used. Node v20+ loads `.env` natively via `--env-file`.

**dashboard-api** — create from example before running dev, knex, or test commands:

```bash
cp dashboard-api/.env.example dashboard-api/.env
```

```env
# dashboard-api/.env
DB_HOST=localhost
DB_PORT=5433
DB_USER=user
DB_PASSWORD=password
DB_NAME=mydb
API_PORT=3001
NODE_ENV=development
```

**web-client** — Vite reads `.env` automatically:

```bash
cp web-client/.env.example web-client/.env
```

```env
# web-client/.env
VITE_DASHBOARD_API_BASE_URL=http://localhost:3001
```

In Docker Compose and CI, environment variables are injected directly — no `.env` file is needed.

### Connection Defaults (`knexfile.ts`)

Connection defaults are defined in `knexfile.ts`:

```env
DB_HOST=localhost
DB_PORT=5433
DB_USER=user
DB_PASSWORD=password
```

When using Docker Compose, PostgreSQL is published on host port `5433`, while container-to-container traffic still uses port `5432`.

Environment-specific database selection:

- **Development**: Uses `DB_NAME` (default: `mydb`)
- **Test**: Uses `${DB_NAME}_test` (default: `mydb_test`)
- **Production**: Uses `DATABASE_URL` if set, else falls back to env-based connection

---

## Troubleshooting

### Database Connection Issues

Check if Postgres is healthy:

```bash
docker compose ps
```

Verify credentials and host:

```bash
psql -h localhost -p 5433 -U user -d mydb
# Password: password
```

### API Not Starting

Check for port conflicts or missing migrations:

```bash
docker compose logs dashboard-api
```

### Web Client Cannot Reach API

Verify `VITE_DASHBOARD_API_BASE_URL` is set correctly. For Docker Compose:

```bash
VITE_DASHBOARD_API_BASE_URL=http://localhost:3001 npm run dev --prefix web-client
```

### Reset Everything

Clean start with fresh database:

```bash
docker compose down -v
docker compose up
```

---

## Related Documentation

- [Dashboard API README](./dashboard-api/README.md)
- [Web Client README](./web-client/README.md)
- [Database README](./db/README.md)
- [Docker Compose Configuration](./docker-compose.yml)
