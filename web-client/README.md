# Payment Portal Web Client

React + TypeScript + Vite application for viewing transactions by status.

## Quick Reference

- **Language**: TypeScript
- **Framework**: React 18 + Router v7
- **Build Tool**: Vite
- **UI Library**: MUI DataGrid
- **Port**: `5173`
- **Node**: `>=24.12.0 <25.0.0`

## Overview

The web client provides a dashboard for viewing transactions organized by status:

- `/transactions/success` – Successful transactions
- `/transactions/failed` – Failed transactions
- `/transactions/pending` – Pending transactions
- `/transactions/all` – All transactions

The UI is **read-only** and displays transactions from the Dashboard API.

## Running the Client

### With Docker Compose (recommended)

See [DASHBOARD_README.md](../DASHBOARD_README.md) for full stack setup:

```bash
docker compose up
```

Access at: http://localhost:5173

### Standalone Development

From `web-client/`:

```bash
npm ci
npm run dev
```

**Prerequisites**:
- Dashboard API running on `localhost:3001` (or set `VITE_DASHBOARD_API_BASE_URL`)
- Database initialized with seed data:
  - `DB_PORT=5433 npm run migrate:latest`
  - `DB_PORT=5433 npm run seed:run`

---

## Features

### Transaction Views

The app renders transaction data in tabs and a Material-UI DataGrid:

- **All Tab**: Shows count of all transactions
- **Status Tabs**: Success, Failed, Pending – each with transaction count and detailed list
- **DataGrid**: Displays transaction rows with columns for status, payment method, tracking ID, etc.

### API Integration

The client calls these endpoints on the Dashboard API:

#### `GET /api/transactions/:status`

Fetch transactions by status.

**Path Parameters**:
- `:status` – One of: `success`, `failed`, `pending`

**Response**:
```json
{
  "data": [...],
  "total": 0
}
```

#### `GET /api/transaction-payment-status`

Fetch aggregate status counts.

**Response**:
```json
{
  "total": 100,
  "success": 67,
  "failed": 67,
  "pending": 66
}
```

---

## Environment Configuration

### Build-Time via Vite

```env
VITE_DASHBOARD_API_BASE_URL=http://localhost:3001
```

If not set, defaults to `http://localhost:3001`.

### Docker Compose

The `docker-compose.yml` automatically sets:

```env
VITE_DASHBOARD_API_BASE_URL=http://localhost:DASHBOARD_API_PORT (default 3001)
```

Database port note for local stack users:

- Host tools like PgAdmin should use PostgreSQL on `localhost:5433`
- Containers connect to PostgreSQL on `postgres:5432`
- If connecting to Postgres directly (outside Docker), use `5432`
- Host-side migration scripts should be prefixed with `DB_PORT=5433`

---

## Testing

### E2E Tests with Cypress

From `web-client/`:

```bash
npm run test:e2e          # Run Cypress tests
npm run test:coverage     # Run with coverage report
```

Or from repository root:

```bash
npm run web-client:test           # E2E tests
npm run web-client:test:coverage  # E2E with coverage
```

---

## Available Scripts

From `web-client/`:

```bash
npm run dev              # Start dev server (hot reload)
npm run build            # Build for production
npm run preview          # Preview production build
npm run test:e2e         # Run Cypress e2e tests
npm run test:coverage    # Run tests with coverage report
npm run lint             # Run ESLint
npm run format           # Format code with Prettier
```

---

## Development Notes

- **Case Handling**: Routes are lowercase (`/transactions/success`), but internally converted to uppercase (`SUCCESS`) for API queries and type matching
- **Navigation**: Uses React Router v7 for client-side routing
- **Styling**: Material-UI components for consistent design
- **Hot Reload**: Vite provides instant feedback during development

---

## See Also

- [DASHBOARD_README.md](../DASHBOARD_README.md) – Complete stack setup and testing guide
- [Dashboard API README](../dashboard-api/README.md) – API endpoints and configuration
- [Database README](../db/README.md) – Migrations and seeds

## Test Coverage Notes

Current e2e coverage includes:

- Route loading for each status page
- Tab-click behavior that changes DataGrid rows
- API error response handling
- Delayed response behavior and empty-grid rendering
- Tab count synchronization with count endpoint and per-tab totals

Specs are under `cypress/e2e/`.

## Key Source Locations

- Router setup: `src/main.tsx`
- Page layout and tab count updates: `src/features/transactions/pages/TransactionsLayout.tsx`
- Status page wrapper: `src/features/transactions/pages/TransactionsStatusPage.tsx`
- DataGrid: `src/features/transactions/components/TransactionsTable.tsx`
- API client: `src/features/transactions/api/transactions.api.ts`

## Local Troubleshooting

If the UI loads but no data appears:

1. Verify API is healthy:

```bash
curl http://localhost:3001/health
```

2. Verify transaction endpoint:

```bash
curl http://localhost:3001/api/transactions/success
```

3. Verify status counts endpoint:

```bash
curl http://localhost:3001/api/transaction-payment-status
```

If running with Docker Compose, check service logs:

```bash
docker compose logs -f dashboard-api web-client
```
