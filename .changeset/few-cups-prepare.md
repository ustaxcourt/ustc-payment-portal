---
"@ustaxcourt/payment-portal": patch
---

PAY-313: prepare Payment Portal for consumer-package usage (`npx @ustaxcourt/payment-portal`) and improve local POC documentation.

- Added published CLI entrypoint via `bin/payment-portal.js` and npm `bin` mapping so consumers can run the portal package directly with `npx @ustaxcourt/payment-portal`.
- CLI now launches `npm run start:all` from the installed package root and loads `.env` from the consumer project's working directory.
- Expanded published package contents to include runtime startup assets needed outside this repo (`scripts`, `db`, `src`, `docker-compose.yml`, `knexfile.ts`, `tsconfig.json`, `bin`).
- Moved runtime-required dependencies used by package startup into `dependencies` so consumers have what the local stack needs.
- Added `scripts/start-dev-server-runtime.js` and updated `start:dev-server` to use it, preferring source runtime via `ts-node/register/transpile-only` with a `dist` fallback.
- Updated docker db-init startup command to support both lockfile-present (`npm ci`) and lockfile-absent (`npm install`) packaged contexts.
- Added docs for safe package POC testing in another repo: `docs/testing-package-locally.md` (with official npm doc links and troubleshooting).
- Added unit tests for runtime launcher behavior in `scripts/start-dev-server-runtime.test.js`.
