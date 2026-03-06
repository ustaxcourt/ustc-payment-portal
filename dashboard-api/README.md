# Transaction Dashboard API

Minimal Express API for the Transaction Dashboard frontend.

## Stack

- **Node.js** (>=18.0.0)
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
npm run dev
```

The API will be available at `http://localhost:3001`

## API Endpoints

### GET /api/transactions/:paymentStatus

Returns up to 100 transactions filtered by `paymentStatus`, ordered by `created_at DESC`.

Supported values:

- `success`
- `failed`
- `pending`

**Request:**
```bash
curl http://localhost:3001/api/transactions/failed
```

**Response:**
```json
{
  "data": [
    {
      "agencyTrackingId": "5ce10085-4bc4-4cb0-ac22-ce34f06fb9c8",
      "paygovTrackingId": "PG-46caa4ac-532f-4ef4-b031-a3dc8b6f9658",
      "feeName": "Filing Fee",
      "feeId": "FEE-001",
      "feeAmount": 211.82,
      "clientName": "payment-portal",
      "transactionReferenceId": "TXREF-00001",
      "paymentStatus": "success",
      "transactionStatus": "processed",
      "paygovToken": "9e8287bc-9a25-4e8a-b95a-cae8d475a376",
      "paymentMethod": "card",
      "lastUpdatedAt": "2026-02-14T05:42:18.582Z",
      "createdAt": "2026-02-11T04:51:10.582Z",
      "metadata": {
        "accountHolder": "John Doe",
        "agencyId": "IRS"
      }
    }
  ],
  "total": 100
}
```

**Error Response (invalid status):**

```json
{
  "error": {
    "message": "Invalid paymentStatus. Expected one of: pending, success, failed"
  }
}
```

## Project Structure

```
dashboard-api/
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
- Transaction test data is generated in `db/seeds/01_transactions.ts`
