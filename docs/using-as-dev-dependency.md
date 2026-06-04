# Using Payment Portal as a Dev Dependency

This guide explains how to add `@ustaxcourt/payment-portal` to a downstream
project (e.g. DAWSON / `ef-cms`) so the full local stack — API, Pay.gov Test
Server, and Postgres — comes up with a single command and a clean database on
every start.

## Prerequisites

- **Docker** must be installed and running (`docker --version`).
- **Node.js** `>=24.12.0 <25.0.0` (match the portal's engine requirement).

## Install

```sh
npm install --save-dev @ustaxcourt/payment-portal
```

The Pay.gov Test Server ships as a transitive runtime dependency — you do **not**
need to install it separately.

## Start

```sh
npx ustc-payment-portal start
```

That's it. No `.env` file required.

What happens under the hood:

1. Postgres starts in Docker with a named volume (`payment_portal_dev_db`).
2. The application schema is dropped and recreated (`DROP SCHEMA public CASCADE`).
3. Knex migrations run to the latest version.
4. Reference-data seeds (fee definitions) are inserted.
5. The Pay.gov Test Server starts.
6. The Payment Portal API starts.

Every invocation produces a **clean slate** — no transactions carry over between
sessions.

## Default ports

| Service             | Default port | Override env var           |
| ------------------- | ------------ | -------------------------- |
| Payment Portal API  | `8080`       | `API_PORT`                 |
| Pay.gov Test Server | `3366`       | `PAY_GOV_TEST_SERVER_PORT` |
| Postgres            | `5433`       | `DB_PORT`                  |

## Optional: `.env.payment-portal`

Create `.env.payment-portal` in the **root of your project** (not committed)
to override any of the three default ports. Only port values are read from this
file — everything else is ignored.

```dotenv
API_PORT=8081
PAY_GOV_TEST_SERVER_PORT=3370
DB_PORT=5434
```

## Type imports

```ts
import type {
  InitPaymentRequest,
  InitPaymentResponse,
  ProcessPaymentRequest,
  ProcessPaymentResponse,
  GetDetailsPathParams,
  GetDetailsResponse,
} from "@ustaxcourt/payment-portal";
```

These types are generated from the Zod schemas — they are always in sync with
the API contract.

## Other commands

```sh
# Tear down the Docker stack
npx ustc-payment-portal stop
```

## Ports used by Payment Portal

Before your first run, confirm that `8080`, `3366`, and `5433` are not already in use. If any conflict, add a `.env.payment-portal` to your project root with the replacement port(s).

## Troubleshooting

### "Docker is not running"

Start Docker Desktop (or the Docker daemon) and re-run the command.

### Port already in use

Re-run with `AUTO_KILL_PORTS=true` to have the CLI kill the conflicting
process automatically, or remap the port via `.env.payment-portal`.

### Stuck migrations / `knex_migrations_lock`

The schema reset on every start drops the lock table, so stale locks from a
prior crash can never block startup. If you see a migration error, check that
Postgres is healthy (`docker ps`).

### Engine mismatch

`@ustaxcourt/payment-portal` requires Node `>=24.12.0 <25.0.0`. Run
`node --version` to confirm. Use `nvm` or `volta` if you need to switch.

### `dist/devServer.js` not found

Run `npm run build` inside the package (or `npx ustc-payment-portal` will use
the pre-compiled dist shipped in the package). This error should only appear
if you cloned the repo and skipped the build step.
