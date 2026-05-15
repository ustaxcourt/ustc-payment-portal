---
"@ustaxcourt/payment-portal": patch
---

PAY-308: make local startup ports configurable via env (`API_PORT`, `DB_PORT`, `PAY_GOV_TEST_SERVER_PORT`) and update local run documentation.

- `start:server` and `start:server:autokill` now use configured ports for preflight checks.
- `src/devServer.ts` now binds to `API_PORT` (default `8080`).
- Docker Compose Postgres host mapping now uses `DB_PORT` (default `5433`).
- Added docs for changing ports and running local startup/health-check scripts.
