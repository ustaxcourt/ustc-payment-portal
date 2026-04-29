# PAY-257 — Refactor `NODE_ENV` Anti-Pattern: Implementation Plan

## Goal

`NODE_ENV` is currently used to encode our *deployment topology* (`local`, `staging`, etc.). That is an anti-pattern — `NODE_ENV` is a Node runtime concern with three legal values: `development`, `production`, `test`. This ticket separates the two concerns:

- **`NODE_ENV`** — Node runtime mode. Values: `development | production | test`. Consumed by Node, Express, knex, Jest, build tools.
- **`APP_ENV`** — Our deployment topology. Values: `local | dev | stg | prod | test`. Consumed by *our* code only.

## Guiding principles

1. **`NODE_ENV` is for the Node runtime, period.** Use it where Node, Express, libraries, or build tooling consume it (test framework, knex pool sizing, dev-only middleware) — nowhere else.
2. **Introduce `APP_ENV` for our deployment topology.** Use it everywhere we currently say "what stage am I in" (cert selection, auth-bypass branches, dev-only route gating, etc.).
3. **Reuse `LOCAL_DEV` rather than duplicate it.** The codebase already has a narrow, correct `LOCAL_DEV=true` flag for SigV4 bypass. Don't invent a third flag for the same concept.
4. **Make the type system enforce it.** Narrow `ProcessEnv['NODE_ENV']`; add a typed `APP_ENV` accessor (`getAppEnv()`).
5. **No silent semantic changes.** Today `NODE_ENV="staging"` means "non-prod Node mode" (so dev-only routes leak into stg). Flipping stg to `NODE_ENV=production` is a real behavior change — call it out, don't smuggle it.

---

## Phase 1 — Foundation (typed accessor + new env var)

### 1.1 New module: `src/config/appEnv.ts`

Single chokepoint for reading the deployment env. Validates, throws on unknown values, gives us one place to mock in tests.

```ts
// src/config/appEnv.ts
export const APP_ENVS = ["local", "dev", "stg", "prod", "test"] as const;
export type AppEnv = (typeof APP_ENVS)[number];

export const getAppEnv = (): AppEnv => {
  const raw = process.env.APP_ENV;

  if (!raw) {
    // Jest sets NODE_ENV=test automatically; treat that as APP_ENV=test
    // when APP_ENV is unset, so unit tests don't have to set both.
    if (process.env.NODE_ENV === "test") return "test";
    throw new Error("APP_ENV is not set");
  }

  if (!(APP_ENVS as readonly string[]).includes(raw)) {
    throw new Error(
      `Invalid APP_ENV "${raw}". Expected one of: ${APP_ENVS.join(", ")}`
    );
  }

  return raw as AppEnv;
};

export const isLocal = (): boolean => getAppEnv() === "local";

export const isDeployed = (): boolean => {
  const env = getAppEnv();
  return env === "dev" || env === "stg" || env === "prod";
};
```

### 1.2 Tighten `src/types/environment.d.ts`

Narrowing the `NODE_ENV` union turns every illegal call site into a TS compile error — that becomes the checklist for the rest of the work.

```ts
// src/types/environment.d.ts
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: "development" | "production" | "test";
      APP_ENV: "local" | "dev" | "stg" | "prod" | "test";
      SOAP_URL: string;
      PAYMENT_URL: string;
      API_ACCESS_TOKEN: string;
      PAY_GOV_DEV_SERVER_TOKEN: string;
      CERT_PASSPHRASE: string;
    }
  }
}

export {};
```

---

## Phase 2 — Application code migration

For each site, decide: is this a **Node runtime** concern or a **deployment** concern?

| File | Current | Classification | Action |
|---|---|---|---|
| [src/db/knex.ts:19,29,31](../src/db/knex.ts#L19) | `NODE_ENV === 'production'` (DB URL), `!== 'production'` (logging) | Node runtime (pool, logging) | **Keep on `NODE_ENV`** |
| [src/db/knex.ts:26](../src/db/knex.ts#L26) | `NODE_ENV === 'test'` → `_test` DB suffix | Node runtime (Jest isolation) | **Keep on `NODE_ENV`** |
| [src/db/knexConfig.ts:4,63](../src/db/knexConfig.ts#L4) | `SupportedEnv` includes `'local'` | Anti-pattern | Drop `'local'` from union; map local dev to `development` |
| [src/appContext.ts:65](../src/appContext.ts#L65) | `NODE_ENV === "local"` for auth header | Deployment | `getAppEnv() === "local"` |
| [src/devServer.ts:95](../src/devServer.ts#L95) | `NODE_ENV !== "production"` gates `/migrations` | Deployment (devServer is local-only) | `getAppEnv() === "local"` |
| [src/test/integration/transaction.test.ts:18](../src/test/integration/transaction.test.ts#L18) | `NODE_ENV === "local"` skips SigV4 | Deployment | `getAppEnv() === "local"` |
| [src/test/integration/migration.test.ts:30](../src/test/integration/migration.test.ts#L30) | `NODE_ENV !== "local"` gates deployed-DB suite | Deployment | `isDeployed()` |
| [src/test/integration/initPayment.test.ts:8](../src/test/integration/initPayment.test.ts#L8), [processPayment.test.ts:8](../src/test/integration/processPayment.test.ts#L8) | `NODE_ENV === "local"` | Deployment | `getAppEnv() === "local"` |
| [src/appContext.test.ts:74,97](../src/appContext.test.ts#L74) | sets `process.env.NODE_ENV` | Test wiring | Set `process.env.APP_ENV` instead, restore in `afterEach` |

### 2.1 Example: `src/appContext.ts`

**Before:**
```ts
const tokenSecretId = process.env.PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID;

if (tokenSecretId) {
  const isLocal = process.env.NODE_ENV === "local";
  if (isLocal) {
    headers.Authorization = `Bearer ${tokenSecretId}`;
    headers.Authentication = headers.Authorization;
  } else {
    // ... fetch from Secrets Manager
  }
}
```

**After:**
```ts
import { isLocal } from "./config/appEnv";

const tokenSecretId = process.env.PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID;

if (tokenSecretId) {
  if (isLocal()) {
    headers.Authorization = `Bearer ${tokenSecretId}`;
    headers.Authentication = headers.Authorization;
  } else {
    // ... fetch from Secrets Manager
  }
}
```

### 2.2 Example: `src/devServer.ts`

**Before:**
```ts
// ONLY FOR LOCAL TESTING - DO NOT CONNECT TO API GATEWAY
if (process.env.NODE_ENV !== "production") {
  app.get("/migrations", async (req, res, next) => { /* ... */ });
}
```

**After:**
```ts
import { isLocal } from "./config/appEnv";

// ONLY FOR LOCAL TESTING - DO NOT CONNECT TO API GATEWAY
if (isLocal()) {
  app.get("/migrations", async (req, res, next) => { /* ... */ });
}
```

> Note: this is **stricter** than today. The previous check let the route be exposed in any non-prod env (including stg). After this change, it is local-only — which is what the comment already promised.

### 2.3 Example: `src/db/knex.ts` (mostly stays the same)

This file is the canonical *correct* use of `NODE_ENV` — no changes to its branches. The only thing the type-narrowing forces is verifying `_test` and `production` literals still typecheck, which they do.

```ts
const {
  DB_HOST = 'localhost',
  DB_PORT = '5432',
  // ...
  NODE_ENV = 'development',  // unchanged: legitimate Node runtime default
  RDS_SECRET_ARN,
} = process.env;

function createKnexFromEnv(): ReturnType<typeof Knex> {
  const connection =
    NODE_ENV === 'production' && process.env.DATABASE_URL  // unchanged
      ? process.env.DATABASE_URL
      : {
        host: DB_HOST,
        port: Number(DB_PORT),
        user: DB_USER,
        password: DB_PASSWORD,
        database: NODE_ENV === 'test' ? `${DB_NAME}_test` : DB_NAME,  // unchanged
      };

  if (NODE_ENV !== 'production') {  // unchanged
    console.log(`[Knex] env=${NODE_ENV} db=...`);
  }

  return Knex({ /* ... */ });
}
```

### 2.4 Example: `src/db/knexConfig.ts`

Drop `'local'` — local dev is just `development` mode running against the docker postgres.

**Before:**
```ts
type SupportedEnv = 'local' | 'development' | 'test' | 'production';

export const knexConfigs: Record<SupportedEnv, Knex.Config> = {
  local: { ...baseConfig, connection: buildConnection('local') },
  development: { ...baseConfig, connection: buildConnection('development') },
  test: { ...baseConfig, connection: buildConnection('test') },
  production: { ...baseConfig, connection: buildConnection('production') },
};

export const getKnexConfigForEnv = (env = process.env.NODE_ENV || 'development'): Knex.Config => {
  if (!(env in knexConfigs)) {
    throw new Error(`Unknown NODE_ENV "${env}". Expected one of: ${Object.keys(knexConfigs).join(', ')}`);
  }
  return knexConfigs[env as SupportedEnv];
};
```

**After:**
```ts
type SupportedEnv = 'development' | 'test' | 'production';

export const knexConfigs: Record<SupportedEnv, Knex.Config> = {
  development: { ...baseConfig, connection: buildConnection('development') },
  test: { ...baseConfig, connection: buildConnection('test') },
  production: { ...baseConfig, connection: buildConnection('production') },
};

export const getKnexConfigForEnv = (
  env: string = process.env.NODE_ENV ?? 'development'
): Knex.Config => {
  if (!(env in knexConfigs)) {
    throw new Error(
      `Unknown NODE_ENV "${env}". Expected one of: ${Object.keys(knexConfigs).join(', ')}`
    );
  }
  return knexConfigs[env as SupportedEnv];
};
```

### 2.5 Example: integration tests

**Before** ([src/test/integration/transaction.test.ts](../src/test/integration/transaction.test.ts)):
```ts
beforeAll(() => {
  isLocal = process.env.NODE_ENV === "local";
});
```

**After:**
```ts
import { isLocal as appIsLocal } from "../../config/appEnv";

beforeAll(() => {
  isLocal = appIsLocal();
});
```

**Before** ([src/test/integration/migration.test.ts:30](../src/test/integration/migration.test.ts#L30)):
```ts
const isDeployed =
  !!baseUrl &&
  baseUrl.startsWith("https://") &&
  process.env.NODE_ENV !== "local";
```

**After:**
```ts
import { isDeployed as appIsDeployed } from "../../config/appEnv";

const isDeployed =
  !!baseUrl &&
  baseUrl.startsWith("https://") &&
  appIsDeployed();
```

### 2.6 Example: unit test wiring

**Before** ([src/appContext.test.ts:74](../src/appContext.test.ts#L74)):
```ts
it("should include authentication header when ...", async () => {
  process.env.PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID = "token-secret-id";
  process.env.NODE_ENV = "test";
  // ...
});
```

**After:**
```ts
describe("postHttpRequest", () => {
  const originalAppEnv = process.env.APP_ENV;
  afterEach(() => {
    process.env.APP_ENV = originalAppEnv;
  });

  it("should include authentication header when ...", async () => {
    process.env.PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID = "token-secret-id";
    process.env.APP_ENV = "test";
    // ...
  });

  it("should include auth headers when retrieved locally", async () => {
    process.env.PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID = "local-token-secret-id";
    process.env.APP_ENV = "local";
    // ...
  });
});
```

---

## Phase 3 — Configuration & scripts

### 3.1 `.env.example`

```diff
- NODE_ENV="local"
+ NODE_ENV="development"
+ APP_ENV="local"
```

### 3.2 `package.json` scripts

```diff
- "test:integration:dev": "NODE_ENV=local DOTENV_CONFIG_PATH=.env.dev npx jest ./src/test/integration/",
+ "test:integration:dev": "APP_ENV=local DOTENV_CONFIG_PATH=.env.dev npx jest ./src/test/integration/",

- "test:db:setup": "node -r dotenv/config ./scripts/ensure-test-db.js && NODE_ENV=test npm run knex -- migrate:latest && NODE_ENV=test npm run knex -- seed:run",
+ "test:db:setup": "node -r dotenv/config ./scripts/ensure-test-db.js && NODE_ENV=test APP_ENV=test npm run knex -- migrate:latest && NODE_ENV=test APP_ENV=test npm run knex -- seed:run",
```

`NODE_ENV=test` stays where Jest/knex need it. `APP_ENV` is added so `getAppEnv()` is never ambiguous.

### 3.3 `docker-compose.yml`

```diff
   environment:
     DB_HOST: postgres
     DB_PORT: 5432
     DB_USER: user
     DB_PASSWORD: password
     DB_NAME: mydb
     NODE_ENV: development
+    APP_ENV: local
     MIGRATION_MODE: "0"
```

### 3.4 `.github/workflows/ci.yml`

```diff
     env:
       DB_HOST: localhost
       DB_PORT: 5432
       DB_USER: user
       DB_PASSWORD: password
       DB_NAME: mydb
-      NODE_ENV: development
+      NODE_ENV: test
+      APP_ENV: test
```

That CI job runs migrate/seed/rollback against an ephemeral postgres — that's exactly a test scenario, not "development."

---

## Phase 4 — Terraform (deployed Lambdas)

This is the most coordination-sensitive phase. Apply in order: **dev → stg → prod**. Only after the application code has been merged and dev is smoke-tested.

### 4.1 `terraform/environments/dev/locals.tf`

```diff
 locals {
   aws_region    = "us-east-1"
   environment   = var.namespace
   node_env      = "development"
+  app_env       = "dev"
   ...

   lambda_env_payment = merge({
     NODE_ENV                           = local.node_env
+    APP_ENV                            = local.app_env
     PAYMENT_URL                        = local.payment_url
     ...
   }, ...)

   lambda_env_dashboard = {
     NODE_ENV                 = local.node_env
+    APP_ENV                  = local.app_env
     ...
   }

   lambda_env_migration = {
     NODE_ENV              = local.node_env
+    APP_ENV               = local.app_env
     ...
   }
 }
```

### 4.2 `terraform/environments/stg/locals.tf`

> **Behavior change — see open question 1.**

```diff
 locals {
   aws_region    = "us-east-1"
   environment   = "stg"
-  node_env      = "staging"
+  node_env      = "production"
+  app_env       = "stg"
   ...

   lambda_env_payment = merge({
     NODE_ENV                           = local.node_env
+    APP_ENV                            = local.app_env
     ...
   }, ...)
 }
```

### 4.3 `terraform/environments/prod/locals.tf`

```diff
 locals {
   aws_region    = "us-east-1"
   environment   = "prod"
   node_env      = "production"
+  app_env       = "prod"
   ...

   lambda_env_payment = merge({
     NODE_ENV                           = local.node_env
+    APP_ENV                            = local.app_env
     ...
   }, ...)
 }
```

---

## Phase 5 — Documentation

- **`README.md:71,81`** — rewrite "Environment variables are located in `.env.<NODE_ENV>`" → `.env.<APP_ENV>`. Update the env-var table: `NODE_ENV` is `development | production | test` only; add `APP_ENV` row with `local | dev | stg | prod | test`.
- **`docs/certificate.md:70`** — change "specify `NODE_ENV` to match the certificate name" → `APP_ENV`.
- **`db/README.md:82-83`** — `NODE_ENV=test` examples are correct *Node usage* — leave as-is, but verify the surrounding wording reads as "Node test mode" not "our test deployment."
- **New ADR** (`docs/architecture/NNNN-app-env-vs-node-env.md`) capturing the rule going forward — this is the artifact that prevents the next dev from re-introducing the anti-pattern.

### Sample README table update

```markdown
| Environment Variable | Description |
| -------------------- | ----------- |
| `NODE_ENV`           | Node runtime mode. One of `development`, `production`, `test`. Set automatically by Jest. |
| `APP_ENV`            | Deployment topology for this service. One of `local`, `dev`, `stg`, `prod`, `test`. |
| ...                  | ... |
```

---

## Phase 6 — Testing & rollout

### Unit / integration

- New tests for `src/config/appEnv.ts`:
  - Valid value returns `AppEnv`.
  - Invalid value throws with helpful message.
  - Unset throws (unless `NODE_ENV=test`).
  - `isLocal()` / `isDeployed()` branches.
- Update `src/appContext.test.ts` and integration suites to set `APP_ENV` instead of `NODE_ENV="local"`. Use `beforeEach`/`afterEach` to snapshot+restore so tests don't leak env state.
- Run full suite locally with `APP_ENV=local`. Coverage must stay ≥ 90%.

### Pre-deploy checks (CI gates)

- `npm run tsc` — narrowed `NODE_ENV` union must compile cleanly. Any error = a missed call site.
- `grep -rn "NODE_ENV" src/` — should only return Node-runtime usages (knex pool/test-db, the type declaration, the new appEnv module).
- `grep -rn 'process.env.NODE_ENV' src/` — must NOT include any string equality with `"local"` or `"staging"`.

### Deploy plan

1. Merge code change to `main`. CI runs with `NODE_ENV=test APP_ENV=test`.
2. `terraform apply` in **dev**. Smoke-test all four payment lambdas + dashboard endpoints + migrationRunner.
3. `terraform apply` in **stg**. **Verify the stg `/migrations` route is now 404** (it was previously exposed because `NODE_ENV=staging !== "production"`). This is the behavior change to confirm.
4. `terraform apply` in **prod**. Smoke-test.

### Rollback

- Code rollback is a simple revert.
- Terraform rollback is per-environment and independent.
- Adding `APP_ENV` is additive for one release. A partial deploy is safe in either direction:
  - **TF applied, code not** → safe; new var is just unused.
  - **Code applied, TF not** → throws at startup (intentional fail-fast; missing `APP_ENV`).

---

## Open questions

> Most of these I was able to verify directly from the codebase — answers are inline below. Only the items still flagged **TECH LEAD** require a decision from him.

---

### 1. What `NODE_ENV` should staging set?

**Answer (verified): set `NODE_ENV=production` in stg. Behavioral impact is essentially zero.**

I traced every code path that branches on `NODE_ENV === "production"` (or `!==`) in deployed Lambda code:

| Site | Effect when `NODE_ENV` flips `staging` → `production` |
| --- | --- |
| [src/db/knex.ts:19](../src/db/knex.ts#L19) — `NODE_ENV === 'production' && DATABASE_URL` selects connection-string mode | **No-op.** Stg sets `RDS_SECRET_ARN`, not `DATABASE_URL` ([terraform/environments/stg/locals.tf:8](../terraform/environments/stg/locals.tf#L8)), so the `&&` short-circuits regardless. |
| [src/db/knex.ts:29](../src/db/knex.ts#L29) — `NODE_ENV !== 'production'` startup log | One log line `[Knex] env=...` is silenced in stg. Cosmetic. |
| [src/db/knexConfig.ts:31](../src/db/knexConfig.ts#L31) — same `production && DATABASE_URL` | Same as above; no-op. |
| [src/devServer.ts:95](../src/devServer.ts#L95) — `NODE_ENV !== "production"` gates `/migrations` route | **N/A in stg.** `devServer.ts` only runs via `npm run start:server` ([package.json:28](../package.json#L28)) — it is never deployed to Lambda. The deployed `migrationRunner` is a separate Lambda with its own auth. |

So the original concern I raised ("flipping stg to production is a real behavior change") was wrong — there is no deployed code path in stg that observes the difference. **Recommend `NODE_ENV=production` in stg as in the plan above; no separate confirmation needed from the tech lead.**

---

### 2. Naming: `APP_ENV` vs `DEPLOY_ENV` vs `STAGE` vs `ENVIRONMENT`?

**Answer (verified): `APP_ENV` is internally consistent with existing Terraform conventions.**

`grep -rn "STAGE\|DEPLOY_ENV\|APP_ENV" terraform/` returns no matches — there is no pre-existing org standard in this repo. Terraform already uses `var.environment` / `local.environment` with the value space `dev`, `stg`, `prod`, `pr-*` ([terraform/template/variables.tf:7](../terraform/template/variables.tf#L7), [terraform/environments/dev/main.tf](../terraform/environments/dev/main.tf)). The proposed `APP_ENV` value space (`local | dev | stg | prod | test`) is a strict superset of those values. Using `APP_ENV` means the Lambda env var matches the Terraform local one-for-one.

**TECH LEAD (light — drive-by confirmation only):** any USTC-wide naming convention I can't see from this repo? If not, proceed with `APP_ENV`.

---

### 3. Should `LOCAL_DEV=true` be folded into `APP_ENV=local` in this ticket, or as a follow-up?

**Recommendation:** follow-up ticket. They are semantically the same flag, but `LOCAL_DEV` gates auth-critical SigV4 bypass in [src/extractCallerArn.ts:49](../src/extractCallerArn.ts#L49) and [src/clients/permissionsClient.ts:49](../src/clients/permissionsClient.ts#L49) (4 files + tests). Rolling the consolidation into PAY-257 expands the blast radius into security-sensitive paths unnecessarily.

Call out the consolidation in the new ADR so the next dev sees it as known tech debt.

---

### 4. Are there any consumers of the `.env.<NODE_ENV>` filename convention outside this repo?

**Answer (verified): no consumers. The `.env.<NODE_ENV>` wording in the README is already inaccurate.**

I searched all `.env.*` references across the repo and the deployment toolchain:

- Only one such file exists: [.env.dev](../.env.dev) (alongside the gitignored `.env`).
- The only consumer is [package.json:21](../package.json#L21): `DOTENV_CONFIG_PATH=.env.dev` in the `test:integration:dev` script.
- Neither Terraform, Docker, the build script ([terraform/scripts/build-lambda.sh](../terraform/scripts/build-lambda.sh)), nor CI ([.github/workflows/ci.yml](../.github/workflows/ci.yml)) reads any `.env.<X>` file. Lambda envs come from `local.lambda_env_*` blocks; CI uses workflow-level `env:`; Docker uses inline `environment:`.
- Notably, [.env.dev](../.env.dev) currently sets `NODE_ENV="local"` — exactly the inversion the ticket calls out. The README claims envs live at `.env.<NODE_ENV>`, but the on-disk file says `.env.<APP_ENV>` (it's named after the deployment, not the Node mode).

**Conclusion:** the README wording is already wrong; this rename is a documentation fix only. No external coordination needed.

---

### 5. Does `dev` keep `NODE_ENV=development`, or move to `production`?

**Answer (verified): keep `NODE_ENV=development` in dev. The `/migrations` concern I originally raised was incorrect.**

Same analysis as #1: the `/migrations` route lives in [src/devServer.ts:95](../src/devServer.ts#L95), which is started by `npm run start:server` and is never bundled into a deployed Lambda. So neither dev nor stg ever exposed `/migrations` via the deployed API Gateway — that route is local-only. Either value works in dev; `development` is the conventional Node value for a non-production deployment. **No tech lead input needed.**

---

### 6. Is there a separate dashboard frontend repo that reads `NODE_ENV`?

**Answer (verified against `~/Desktop/Apps/ustc-payment-portal-dev-dashboard`): no cross-repo coupling. Safe to proceed.**

I checked the sibling repo directly:

- **Zero `NODE_ENV` references** anywhere in the dashboard source, config, or build files.
- **No reads of any `.env.<X>` file** from this repo. The dashboard has its own `.env.example` containing one variable: `VITE_DASHBOARD_API_BASE_URL=http://localhost:8080`. That's a Vite-prefixed runtime config, not a Node mode flag.
- **Independent deploy pipeline.** Dashboard is deployed via AWS Amplify ([amplify.yml](../../ustc-payment-portal-dev-dashboard/amplify.yml)) — no shared Terraform, no shared build script, no shared CI workflow with this repo.
- **Only integration surface is HTTP at runtime.** Dashboard hits our API at `VITE_DASHBOARD_API_BASE_URL` (= our `BASE_URL`). That contract is unchanged.
- The only `payment-portal` string in the dashboard repo is its own `package.json` `name` field — a naming holdover, not a code reference.

**Conclusion:** no tech-lead input needed. Renaming the `.env.<NODE_ENV>` convention in this repo's README is fully isolated.

---

### Net result

Of the original six questions: **five are now fully self-answered**. Only **#2 (naming convention)** remains as a drive-by confirmation for the tech lead. No question is a blocker for starting implementation.
