# Transaction Dashboard API

Minimal Express API for the Transaction Dashboard frontend.

## Stack

- **Node.js** (>=24.12.0)
- **Express** 5.x
- **PostgreSQL** (via Docker)
- **Knex** (query builder)
- **Objection ORM** (models)
- **dotenv** (configuration)

## Prerequisites

1. PostgreSQL running locally via Docker:
   ```bash
   docker-compose up -d
   ```

2. Run migrations:
   ```bash
   npm run migrate:latest
   ```

3. Seed the database:
   ```bash
   npm run seed:run
   ```

## Environment Variables

Create a `.env` file:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=dashboard
API_PORT=3001
NODE_ENV=development
```

Note: These credentials must match your local PostgreSQL instance (see `docker-compose.yml`).

## Running the API

Start the local API server:

```bash
npm run dev:local
```

The API will be available at `http://localhost:3001`

## API Endpoints

### GET /api/transactions

Returns the latest 100 transactions ordered by `created_at DESC`.

**Request:**
```bash
curl http://localhost:3001/api/transactions
```

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "client_app": "payment-portal",
      "external_reference_id": "REF-0001",
      "fee_code": "FEE-001",
      "amount_cents": 500,
      "currency": "USD",
      "status": "succeeded",
      "created_at": "2026-03-05T19:55:03.000Z",
      "updated_at": "2026-03-05T19:55:03.000Z"
    }
  ]
}
```

## Project Structure

```
src/
  server.ts                   # Entry point
  app.ts                      # Express app configuration
  db/
    knex.ts                   # Knex instance + Objection setup
  models/
    Transaction.ts            # Transaction model
  controllers/
    transactions.controller.ts # Business logic
  routes/
    transactions.routes.ts    # Route definitions
```

## Development Notes

- The API uses CORS to allow requests from any origin (suitable for local development)
- Error handling middleware catches and logs all errors
- Connection pooling is configured via Knex (min: 2, max: 10)
- The database schema is managed via Knex migrations (do not modify manually)
