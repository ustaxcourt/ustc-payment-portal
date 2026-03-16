# Dashboard API Integration into `/src`

## Decision

The `dashboard-api/` Express server is a **local development tool only**. Its business logic — querying transactions from the database — will be migrated into `/src` and deployed as AWS Lambda functions, living alongside the existing payment Lambda handlers.

## Context

The existing `/src` backend already ships three Lambda handlers to API Gateway:

| Handler export | HTTP route | Purpose |
|---|---|---|
| `initPaymentHandler` | `POST /init` | Starts a Pay.gov collection |
| `processPaymentHandler` | `POST /process` | Completes a Pay.gov collection |
| `getDetailsHandler` | `GET /details/:appId/:payGovTrackingId` | Fetches transaction status |

All three follow the same pattern: exported from `src/lambdaHandler.ts`, wired to API Gateway routes in Terraform, and reachable locally via `src/devServer.ts`.

The `dashboard-api/` directory is a separate Express server that exists solely to support local dashboard development. It connects to Postgres via Knex/Objection and exposes transaction read endpoints. It has no Lambda entry points and is never deployed.

## Decision

Rather than maintaining a separate Express app in `dashboard-api/`, the dashboard endpoints will be refactored into `/src` using the same pattern as the existing Lambda handlers:

```
src/
├── useCases/
│   ├── getDetails.ts             # existing
│   ├── initPayment.ts            # existing
│   ├── processPayment.ts         # existing
│   └── transactions.ts           # NEW — dashboard business logic
└── dashboard/
    ├── db/
    │   └── knex.ts               # Knex + Objection initialization
    ├── models/
    │   └── TransactionModel.ts   # Objection model (moved from dashboard-api/)
    ├── handlers/
    │   └── transactions.handler.ts  # Lambda entry points (new)
    └── routes/
        └── transactions.routes.ts   # Express adapter for local dev (replaces dashboard-api/)
```

The three new Lambda handlers will be exported from `src/lambdaHandler.ts` alongside the existing ones:

| Handler export | HTTP route | Purpose |
|---|---|---|
| `getAllTransactionsHandler` | `GET /api/transactions` | 100 most recent transactions |
| `getTransactionsByStatusHandler` | `GET /api/transactions/:paymentStatus` | Filtered by status |
| `getTransactionPaymentStatusHandler` | `GET /api/transaction-payment-status` | Aggregated counts per status |

## Architecture

```
                        ┌─────────────────────────────────  ┐
                        │         src/lambdaHandler.ts      │
                        │                                   │
                        │  initPaymentHandler         ─────►│ Pay.gov SOAP
                        │  processPaymentHandler      ─────►│ Pay.gov SOAP
                        │  getDetailsHandler          ─────►│ Pay.gov SOAP
                        │                                   │
                        │  getAllTransactionsHandler  ─────►│ RDS Postgres
                        │  getTransactionsByStatus..  ─────►│ RDS Postgres
                        │  getTransactionPayment..    ─────►│ RDS Postgres
                        └─────────────────────────────────  ┘
                                        │
                              same exports, same file
                                        │
                        ┌───────────────▼─────────────────┐
                        │       API Gateway (Terraform)    │
                        └─────────────────────────────────┘
```

Locally, `src/devServer.ts` mounts the same dashboard routes via Express so the web client can develop against a real server without deploying:

```
src/devServer.ts
  └── mounts /api/* → src/dashboard/routes/transactions.routes.ts
                          └── calls src/useCases/transactions.ts
                                        └── TransactionModel → Postgres
```

## Key Principle: Use Cases Are the Shared Layer

Business logic lives in `src/useCases/transactions.ts` as plain `async` functions with no HTTP or Lambda types, alongside the existing use cases (`getDetails.ts`, `initPayment.ts`, `processPayment.ts`). Both adapters (Lambda handler and Express route) call the same functions:

```
TransactionModel (DB)
        │
        ▼
  src/useCases/transactions.ts     ← written once, lives alongside existing use cases
       │               │
       ▼               ▼
 Lambda handler    Express route
 (deployed)        (local dev only)
```

## What Happens to `dashboard-api/`

Once the migration is complete and verified:

1. `dashboard-api/routes/`, `controllers/`, `models/`, `db/` are deleted — replaced by `src/dashboard/`
2. `dashboard-api/app.ts` and `dashboard-api/server.ts` are deleted — the dev server is `src/devServer.ts`
3. `dashboard-api/knexfile.ts` is deleted — the root `knexfile.ts` is used instead
4. `dashboard-api/package.json` dependencies (`knex`, `objection`, `pg`, etc.) move to the root `package.json`
5. The `dashboard-api/` directory can be removed entirely

During migration, `dashboard-api/` remains untouched and fully functional so local development is never interrupted.

## Implementation Record

### Completed Steps

1. **`src/dashboard/db/knex.ts`** — Knex + Objection initialisation. The config is **inlined from environment variables** (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`) rather than importing the root `knexfile.ts`, because `tsconfig.json` sets `rootDir` to `src/` and TypeScript rejects imports outside that boundary.
2. **`src/dashboard/models/TransactionModel.ts`** — Objection model copied from `dashboard-api/models/`. Exposes `getAll()`, `getByPaymentStatus()`, and `getAggregatedPaymentStatus()` (includes a `total` field capped at 100).
3. **`src/useCases/transactions.ts`** — Pure business logic: `getRecentTransactions()`, `getTransactionsByStatus()`, `getTransactionPaymentStatus()`, `isValidPaymentStatus()`. No HTTP or Lambda types.
4. **`src/dashboard/routes/transactions.routes.ts`** — Express Router calling the use cases. Mounted by `src/devServer.ts` at `/api`.
5. **`src/dashboard/handlers/transactions.handler.ts`** — Three Lambda handlers (`getAllTransactionsHandler`, `getTransactionsByStatusHandler`, `getTransactionPaymentStatusHandler`) returning `APIGatewayProxyResult`.
6. **`src/lambdaHandler.ts`** — Re-exports the three new handlers alongside the existing ones.
7. **`src/devServer.ts`** — Imports `./dashboard/db/knex` (initialises Objection) and mounts `dashboardRoutes` at `/api`.

### Terraform Infrastructure (dev environment only)

| File | Change |
|------|--------|
| `terraform/modules/lambda/main.tf` | Added `getAllTransactions`, `getTransactionsByStatus`, `getTransactionPaymentStatus` to `local.lambda_functions` — the `for_each` auto-creates Lambdas + CloudWatch log groups |
| `terraform/modules/lambda/outputs.tf` | Added individual invoke ARN outputs for the three new functions |
| `terraform/modules/api-gateway/main.tf` | Added 4 path resources (`/api`, `/api/transactions`, `/api/transactions/{paymentStatus}`, `/api/transaction-payment-status`), 3 GET methods, 3 `AWS_PROXY` integrations, 3 Lambda permissions; updated deployment triggers + `depends_on` |
| `terraform/environments/dev/variables.tf` | Added 6 variables (`*_s3_key` + `*_source_code_hash` per function) |
| `terraform/environments/dev/main.tf` | Expanded `artifact_s3_keys` and `source_code_hashes` maps to 7 functions |
| `terraform/environments/dev/terraform.tfvars` | Placeholder S3 keys for the 3 new artifacts |
| `terraform/scripts/build-lambda.sh` | Added esbuild loop for the 3 new functions (same `lambdaHandler.ts` entry point) |

**No IAM changes required** — the shared Lambda execution role already wildcards to `ustc-payment-processor*`. The upload script (`upload_lambda_artifacts_s3.sh`) loops over all `dist/` directories and requires no changes.

**Stg/prod environments are unchanged** — they still reference only the original 4 functions. Dashboard infra will be promoted to stg/prod after dev verification.

### Remaining Steps

8. Deploy to dev, run integration tests
9. Promote Terraform changes to stg and prod environments
10. Remove `dashboard-api/`

### Design Constraint: `rootDir`

The project's `tsconfig.json` sets `"include": ["./src/**/*"]`, which makes `src/` the implicit `rootDir`. Any import that reaches outside `src/` (e.g., `import knexConfig from '../../../knexfile'`) triggers TypeScript error TS6059. This is why `src/dashboard/db/knex.ts` inlines its database configuration from `process.env` rather than importing the root `knexfile.ts`.
