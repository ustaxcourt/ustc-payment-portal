---
"@ustaxcourt/payment-portal": minor
---

PAY-308: add one-command local startup for the full stack (Pay.gov test server + Postgres + portal API), with port-conflict preflight and a smoke check.

- New `npm run start:server` brings up `docker compose` (waiting for Postgres to be healthy), then the Pay.gov test server, then the portal — and stops the docker stack on shutdown.
- New `npm run start:server:autokill` does the same but auto-frees the configured ports first (prompts the user otherwise).
- New `npm run check:local-flow` runs an end-to-end `/init` → `/pay` smoke test against the local stack and verifies the rendered HTML actually contains the issued token.
- Local startup ports are configurable via `.env`: `API_PORT`, `DB_PORT`, `PAY_GOV_TEST_SERVER_PORT`. Defaults are `8080`, `5433`, `3366`.
- `src/devServer.ts` now binds to `API_PORT`; `docker-compose.yml` Postgres host port now uses `DB_PORT`.
- `running-locally.md` is reorganized into explicit "Setting up" and "Running" sections per the acceptance criteria.
