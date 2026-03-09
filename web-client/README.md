# Payment Portal Web Client

React + TypeScript + Vite application for the transaction dashboard UI.

## What This App Does

- Routes users to transaction status views:
  - `/transactions/success`
  - `/transactions/failed`
  - `/transactions/pending`
- Displays transaction rows in MUI DataGrid.
- Reads aggregated tab counts and per-status transaction lists from `dashboard-api`.

The UI is read-only in the local dashboard flow.

## API Endpoints Used

The app calls these API endpoints:

- `GET /api/transactions/:status`
- `GET /api/transaction-payment-status`

`status` values are `success`, `failed`, or `pending`.

The base URL comes from:

- `VITE_DASHBOARD_API_BASE_URL`

If unset, the app defaults to `http://localhost:3001`.

## Install and Run

From `web-client/`:

```bash
npm ci
npm run dev
```

Default local URL:

- `http://localhost:5173`

For full stack (recommended), run from repository root:

```bash
docker compose up
```

## Scripts

- `npm run dev`: start Vite dev server
- `npm run build`: type-check and build production assets
- `npm run preview`: preview build output
- `npm run preview:test`: preview on `127.0.0.1:4173` for Cypress
- `npm run cypress:open`: open Cypress UI
- `npm run cypress:run`: run Cypress headless
- `npm run test:e2e`: build, preview, then run Cypress suite

From repository root, equivalent command:

```bash
npm run web-client:test
```

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
