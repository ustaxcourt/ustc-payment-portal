# PAY-328: Payment Portal as a Dev Dependency — Release Plan

## Overview

Promote `@ustaxcourt/payment-portal` to a first-class dev dependency suitable
for downstream consumers (e.g. `ef-cms` / DAWSON). The goal is a zero-config
default experience: a DAWSON developer adds the package, runs a single
command, and has the Payment Portal API + Pay.gov Test Server + database
running locally with a clean, seeded state.

This plan operationalizes the lessons learned from the POC on the
`PAY-313-run-payment-portal-as-package` branch.

## Goals

1. **Zero-config default**: no `.env` required to run the portal locally.
2. **Single command** to bring up Payment Portal + Pay.gov Test Server +
   Postgres.
3. **Optional override** via `.env.payment-portal` (consumer-side).
4. **Clean migrations** every run — no leftover transactions between sessions.
5. **First-class types** exported for downstream TS consumers.
6. **1.0.0 release** of the package.

## Non-Goals

- Hosting/cloud-side changes to the Payment Portal.
- Changes to the Pay.gov contract or the production Pay.gov client.
- Any DAWSON-side integration code (lives in `ef-cms`).

## Acceptance Criteria (from story)

- [ ] Documentation exists to add and configure the Portal as a dev dependency
      with a single command to run the Portal + Pay.gov Test Server.
- [ ] Pay.gov Test Server is a runtime dependency of `ustc-payment-portal`
      (consumers should not install it separately).
- [ ] Anurag or Devin walked through the docs and confirm it works end-to-end.
- [ ] Default configuration requires no consumer `.env`. Default ports are
      documented.
- [ ] Optional override via `.env.payment-portal` for:
  - `API_PORT` (default `8080`)
  - `PAY_GOV_TEST_SERVER_PORT` (default `3366`)
  - `DB_PORT` (default `5433`)
- [ ] Released as `1.0.0` (major).
- [ ] Types exported for downstream consumers (`.d.ts`).
- [ ] Every server start yields a clean DB: no transactions, fees seeded.

---

## Current State (relevant facts)

- Package: `@ustaxcourt/payment-portal`, currently `0.1.3`.
- Build: `tsup src/index.ts --format cjs,esm --dts` → `dist/index.{js,mjs,d.ts}`.
- `package.json#files`: `["dist", "README.md", "LICENSE"]`.
- `src/index.ts` currently re-exports a small set of entities/errors/handlers
  but **does not** export the request/response Zod schemas/types that
  downstream consumers will want.
- `scripts/start-local-stack.js` already orchestrates docker + portal +
  Pay.gov test server, reading `API_PORT` / `DB_PORT` / `PAY_GOV_TEST_SERVER_PORT`
  with sane defaults (8080 / 5433 / 3366).
- `@ustaxcourt/ustc-pay-gov-test-server` is currently a **devDependency**;
  consumers cannot rely on it transitively.
- Knex migrations + seeds exist under `db/migrations` and `db/seeds`. Local
  flow runs `migrate:latest` + `seed:run` but does not guarantee a clean DB
  on every start.

---

## Workstreams

### 1. Package surface: zero-config CLI + transitive Pay.gov server

**Outcome:** consumer runs `npx payment-portal start` (or equivalent) and
everything comes up.

- [ ] Move `@ustaxcourt/ustc-pay-gov-test-server` from `devDependencies` to
      `dependencies` so it ships transitively.
- [ ] Add a published CLI entry. Options:
  - `package.json#bin`: `{ "payment-portal": "dist/cli.js" }`
  - `dist/cli.js` is a thin wrapper that loads `.env.payment-portal` (if
    present, from the consumer's CWD) and then invokes the same orchestration
    logic as `scripts/start-local-stack.js`.
- [ ] Promote `scripts/start-local-stack.js` (and its `lib/`) into `src/` (or
      `src/cli/`) so it is compiled by `tsup` and shipped in `dist/`.
  - Today these scripts live under `scripts/` which is **not** included in the
    published `files` array.
- [ ] Update `package.json#files` if any non-`dist` assets need to ship
      (migrations, seeds, docker compose, knexfile — see workstream 3).
- [ ] Subcommands to consider:
  - `payment-portal start` — full stack (default)
  - `payment-portal start --no-pay-gov` — portal + db only
  - `payment-portal stop` — tear down docker
  - `payment-portal reset-db` — explicit clean+seed (bonus)

### 2. Configuration: defaults + `.env.payment-portal` override

**Outcome:** no consumer-side `.env` required; opt-in overrides via a
namespaced file.

- [ ] CLI looks for `.env.payment-portal` in the **consumer's CWD only**
      (the root of the project that installed the package) and loads it
      via `dotenv` **before** reading config.
  - Do **not** load the consumer's `.env` — namespacing avoids collisions
    with DAWSON's own env.
  - Do **not** walk up the directory tree; CWD-only keeps behavior
    predictable.
- [ ] Centralize defaults in one module (e.g. `src/config/devDefaults.ts`):
  - `API_PORT=8080`
  - `PAY_GOV_TEST_SERVER_PORT=3366`
  - `DB_PORT=5433`
  - DB name/user/password defaults suitable for an ephemeral local container.
  - Any Pay.gov test-server URLs/credentials needed by the portal in dev.
- [ ] Audit `src/appContext.ts` and `src/config/` for env vars that are
      currently **required** at startup (e.g. AWS Secrets Manager, KMS keys,
      cert material). Provide local-mode fallbacks gated on
      `APP_ENV=local` so the portal boots without AWS credentials.
- [ ] Document the full list of overridable variables in
      `running-locally.md` and the new "use as dev dependency" doc.

### 3. Database: clean slate every start

**Outcome:** every `payment-portal start` brings up an empty transactions
table with the default fees seeded.

- [ ] Clean-slate mechanism: **schema reset on startup** (chosen because it
      survives SIGKILL and doesn't depend on the consumer's docker state):
  1. CLI brings up the Postgres container with a named volume scoped to
     this tool (e.g. `payment_portal_dev_db`).
  2. On startup, **drop and recreate the application schema**
     (`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`) before running
     migrations.
  3. Run `knex migrate:latest` to head.
  4. Run `knex seed:run` to populate reference data (fees).
- [ ] Graceful shutdown (SIGINT/SIGTERM) stops the container but does
      **not** need to remove the volume — the startup-time schema reset is
      the source of truth for clean state.
- [ ] Fix the migration race observed in the POC:
  - Ensure migrations run **serially** before the API server begins
    accepting requests (the API process must not start until
    `migrate:latest` resolves).
  - Use `migrate:unlock` defensively at startup in case a prior crash left
    the `knex_migrations_lock` row set.
- [ ] Ship migrations + seeds inside the package, **pre-compiled to `.js`**
      in `dist/db/migrations/` and `dist/db/seeds/` via a `tsup` (or `tsc`)
      build step. Avoids shipping `ts-node` to consumers.
- [ ] Ship `knexfile` config suitable for the dev-dependency mode (resolves
      paths inside `dist/` rather than the source tree).
- [ ] Ship `docker-compose.yml` (or generate one at runtime in a temp
      directory) so the CLI can bring up Postgres without requiring the
      consumer to copy files.

### 4. Type exports for downstream consumers

**Outcome:** `import type { InitPaymentRequest } from '@ustaxcourt/payment-portal'`
just works.

**Approach:** export types from `src/index.ts` (not a hand-written `.d.ts`).
`tsup --dts` generates `dist/index.d.ts` automatically from these exports.
A hand-written `.d.ts` would duplicate the Zod-derived types and drift
silently — the generated approach keeps the schemas as the single source
of truth.

- [ ] Expand `src/index.ts` to export the request and response types for
      the three public endpoints. The 1.0 public type surface is exactly:

  ```ts
  export type {
    InitPaymentRequest,
    InitPaymentResponse,
  } from "./schemas/InitPayment.schema";
  export type {
    ProcessPaymentRequest,
    ProcessPaymentResponse,
  } from "./schemas/ProcessPayment.schema";
  export type {
    GetDetailsPathParams,
    GetDetailsResponse,
  } from "./schemas/GetDetails.schema";
  ```

  Transitive types referenced by the responses (e.g. `PaymentStatus`,
  `TransactionRecordSummary`) are pulled in automatically by the
  TypeScript compiler when consumers import the response types — they do
  not need to be re-exported by name.

- [ ] Confirm `tsup --dts` produces a single `dist/index.d.ts` that
      resolves all exported types. (Discriminated unions on Zod schemas
      sometimes need explicit `z.infer` re-exports — verify.)
- [ ] Add a smoke test that imports types from the **built** `dist/` to
      catch regressions where a type accidentally references something
      not bundled.

### 5. Documentation

**Outcome:** a DAWSON developer can succeed without asking us anything.

- [ ] New doc: `docs/using-as-dev-dependency.md` covering:
  - Install: `npm i -D @ustaxcourt/payment-portal`
  - Prerequisites: Docker + Node version.
  - Single-command run: `npx payment-portal start`
  - Default ports table (API 8080, Pay.gov 3366, DB 5433).
  - Optional `.env.payment-portal` override (with example).
  - Clean-slate behavior on each start.
  - Type imports example.
  - Troubleshooting: port conflicts, docker not running, stuck migrations.
- [ ] Cross-link from `README.md` and `running-locally.md`.
- [ ] Walkthrough validation: schedule with Anurag or Devin to follow the
      docs from a clean machine and capture friction.

### 6. Release: 1.0.0

- [ ] Add a Changeset entry marking a **major** bump.
- [ ] Update `CHANGELOG.md` notes to call out:
  - New CLI entrypoint.
  - Pay.gov test server now a runtime dep.
  - Public type exports.
  - Clean-slate DB behavior.
  - Any breaking changes to existing imports from `src/index.ts`.
- [ ] Verify `ci:publish` flow still works (`npm run build && changeset publish --provenance`).
- [ ] Tag and publish 1.0.0.

---

## Risks & Open Questions

- **Shipping migrations.** Compiling `.ts` migrations to `.js` requires care
  with knex's migration runner (`loadExtensions: ['.js']` in the shipped
  knexfile).
- **Docker assumption.** We assume the consumer has Docker. Document it
  explicitly; fail fast with a clear error if `docker` is not on PATH.
- **Port collisions with DAWSON.** DAWSON already uses several local ports;
  confirm 8080/3366/5433 don't collide with their stack. If they do, the
  `.env.payment-portal` override is the escape hatch — call this out in docs.
- **Volume cleanup on ungraceful exit.** SIGKILL bypasses our shutdown hook.
  The startup-time schema reset is the safety net.
- **CLI shape.** `bin` name `payment-portal` vs. something more specific
  (`ustc-payment-portal`)? Pick one and commit. (Lets go with ustc-payment-portal)

## What to Salvage from the POC Branch

The POC branch (`PAY-313-run-payment-portal-as-package`) is significantly
behind `main` and will not be merged. The list below identifies the
specific artifacts worth lifting (re-implementing on top of `main`) versus
explicitly leaving behind.

### Pull (re-implement on `main`)

- **`bin/payment-portal.js`** — small (~40 LOC) CLI shim that:

  - `chmod +x` shebang entry
  - `cwd: packageRoot` so `npm run start:all` resolves inside the package
  - SIGINT/SIGTERM forwarding to the child
  - Re-exits with the child's signal via `process.kill(process.pid, signal)`

  **Adapt:** the POC loads `.env` from the consumer's CWD. Change to
  `.env.payment-portal` per the story.

- **`scripts/start-dev-server-runtime.js`** — picks `dist/devServer.js` when
  present, falls back to `src/devServer.ts` via `ts-node/register/transpile-only`
  for in-repo dev. Lets a single `start:dev-server` script work both for
  package consumers and for our own `npm run dev` loop.

- **`package.json` changes:**

  - `"bin": { "payment-portal": "bin/payment-portal.js" }`
  - `"prepack": "npm-run-all clean build"`
  - `"build:dev-server": "tsup src/devServer.ts --format cjs"` (so the
    runtime script can find a compiled `dist/devServer.js`)
  - `"clear:dockerdb": "docker compose down -v && docker compose up -d --wait"`
    (useful primitive for the clean-slate workstream)
  - Expanded `files` array: `bin`, `db`, `docker-compose.yml`, `knexfile.ts`,
    `tsconfig.json`, plus the specific JS scripts the CLI loads at runtime.
  - Promote runtime deps that the local stack actually needs: `express`,
    `npm-run-all`, `pino-pretty`, `@ustaxcourt/ustc-pay-gov-test-server`.

- **`docs/testing-package-locally.md`** — solid base for the new
  `docs/using-as-dev-dependency.md`. Reuse the `npm pack` and `npm link`
  walkthroughs and the troubleshooting section (engine mismatch, port
  conflicts, token misalignment hint).

  **Adapt:** swap `.env` references for `.env.payment-portal`, drop the
  large block of required env vars in favor of "no env required by
  default; here is the override list."

- **`src/index.ts`** — POC added handler re-exports
  (`getAllTransactionsHandler`, `getTransactionsByStatusHandler`,
  `getTransactionPaymentStatusHandler`). `main` already has these. Use this
  as a starting point and extend with the schema/type exports listed in
  workstream 4.

### Do NOT pull

- **`src/appContext.ts` simplification.** The POC strips out
  `localRequest` / `lambdaRequest` plumbing and the per-request logger.
  `main` has since hardened request-scoped logging — re-introducing the
  POC version would regress that work.
- **`src/devServer.ts` rewrite to a module-level `appContext`.** Same
  reason — loses per-request logger context. Keep `main`'s middleware
  approach.
- **Anything terraform/CI/workflow-related** on the branch. The POC was
  cut from an older `main`; those files have moved on.
- **The branch's `package-lock.json`.** Regenerate from the new
  `package.json` rather than cherry-picking.

### Gaps in the POC (must still be designed fresh)

The POC delivered "runs from another project" but did not solve:

1. **Clean-slate DB on every start.** POC relied on `docker compose down -v`
   between sessions; nothing forces this on SIGTERM, and `docker compose up`
   alone reuses the volume.
2. **Migration race / lock.** POC did not add startup-time `migrate:unlock`
   or serialize migrations before the API binds.
3. **`.env.payment-portal`** namespacing — POC reads plain `.env`.
4. **Local-mode startup without AWS creds.** POC still requires
   `PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID` etc. in the consumer's env. We need
   defaults baked in for `APP_ENV=local`.
5. **Schema/type exports.** POC only re-exported handlers, not the
   request/response types DAWSON needs.

## Sequencing

1. Workstream 4 (type exports) — small, unblocks DAWSON's type-only work
   independent of runtime changes.
2. Workstream 2 (config defaults + `.env.payment-portal`).
3. Workstream 3 (clean-slate DB + migration handling).
4. Workstream 1 (CLI + ship Pay.gov server transitively).
5. Workstream 5 (docs) in parallel with 1–3 as features land.
6. Walkthrough with Anurag/Devin.
7. Workstream 6 (1.0.0 release).
