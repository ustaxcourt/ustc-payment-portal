---
"@ustaxcourt/payment-portal": major
---

1.0.0 — First-class dev dependency release

- **CLI entrypoint**: `npx payment-portal start` brings up the full local stack (Payment Portal API + Pay.gov Test Server + Postgres) with zero configuration required.
- **Pay.gov Test Server** (`@ustaxcourt/ustc-pay-gov-test-server`) promoted from devDependency to dependency — consumers no longer need to install it separately.
- **Zero-config defaults**: No `.env` required. All ports have documented defaults (API 8080, Pay.gov 3366, DB 5433). Override via `.env.payment-portal` in the consumer's project root.
- **Clean database on every start**: The CLI performs a full schema reset (`DROP SCHEMA public CASCADE`) followed by `knex migrate:latest` and `knex seed:run` before the API accepts requests. No leftover transactions between sessions.
- **TypeScript-native migrations and seeds** ship as `.ts` source in `db/` — run via `tsx` (bundled as a dependency). No pre-compilation step; consumers are assumed to be TypeScript projects.
- **Public type exports**: `InitPaymentRequest`, `InitPaymentResponse`, `ProcessPaymentRequest`, `ProcessPaymentResponse`, `GetDetailsPathParams`, `GetDetailsResponse` exported from the package root for downstream TypeScript consumers.
- **Breaking change**: The package now targets consumers who run it as a dev dependency. The `start:all` npm script no longer loads `.env` by default when invoked through the CLI; use `.env.payment-portal` instead.
