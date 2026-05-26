---
"@ustaxcourt/payment-portal": patch
---

PAY-313: prepare Payment Portal for consumer-package usage (`npx @ustaxcourt/payment-portal`) and improve local POC documentation.

- Added published CLI entrypoint via `bin/payment-portal.js` and npm `bin` mapping so consumers can run the portal package directly with `npx @ustaxcourt/payment-portal`.
- CLI now launches `npm run start:all` from the installed package root and loads `.env` from the consumer project's working directory.
- Expanded published package contents to include runtime startup assets needed outside this repo (`scripts`, `db`, `src`, `docker-compose.yml`, `knexfile.ts`, `tsconfig.json`, `bin`).
- Moved runtime-required dependencies used by package startup into `dependencies` so consumers have what the local stack needs.
- Added `scripts/start-dev-server-runtime.js` and updated `start:dev-server` to use it, preferring compiled runtime (`dist/devServer.js`) by default, with explicit source mode via `PAYMENT_PORTAL_USE_SOURCE_DEV_SERVER=true`.
- Updated build pipeline to always produce `dist/devServer.js` (`build:dev-server`) and added `prepack` to guarantee fresh `dist/` artifacts before `npm pack` / publish.
- Moved `ts-node` and `typescript` back to `devDependencies` after making consumer runtime dist-based.
- Removed `src` from published `files` to reduce package size.
- Updated docker db-init startup command to support both lockfile-present (`npm ci`) and lockfile-absent (`npm install`) packaged contexts.
- Updated docker db-init lockfile-absent branch to `npm install --no-package-lock` to avoid writing lockfiles in bind-mounted packaged contexts.
- Added docs for safe package POC testing in another repo: `docs/testing-package-locally.md` (with official npm doc links and troubleshooting).
- Added unit tests for runtime launcher behavior in `scripts/start-dev-server-runtime.test.js`.
- Guarded local pretty logger transport to avoid startup crashes when `pino-pretty` is unavailable in consumer environments.
