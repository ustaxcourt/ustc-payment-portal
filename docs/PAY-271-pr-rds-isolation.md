# PAY-271: Ephemeral PR Environment — RDS Isolation via Per-PR Database

> **Working document — delete before merging.**

## Overview

Integration tests for PR environments need live database access to verify migration
correctness (acceptance criteria from PAY-052 transaction tracking). This plan gives each
ephemeral PR environment its own database on the shared dev RDS instance (Postgres 16.6),
leaving the dev `paymentportal` database untouched.

**RDS instance:** Shared dev RDS — `DROP DATABASE ... WITH (FORCE)` is supported on 16.6.

**Approach:** Each PR gets a dedicated database (e.g. `paymentportal_pr_123`) on the dev RDS.
The PR Lambda connects to that database via `DB_NAME` in its env vars. The database is created
before migrations run and dropped on PR close.

---

## Why a separate database over PostgreSQL schemas

- A connection scoped to `paymentportal_pr_123` physically cannot touch `paymentportal` tables,
  even via unqualified `knex.raw` queries — stronger isolation than `search_path` tricks
- No `search_path` plumbing needed in `knex.ts` — `DB_NAME` is already read from the env
- Cleaner mental model for developers

---

## Current state (what actually exists today)

Before reading the sections below, understand the baseline:

- `src/db/knex.ts` reads `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` directly
  from `process.env`. It does **not** read `RDS_ENDPOINT` or `RDS_SECRET_ARN`.
- `terraform/environments/dev/locals.tf` passes only `RDS_ENDPOINT` and `RDS_SECRET_ARN` to
  Lambda env vars. The individual `DB_*` connection vars are never populated at runtime.
- As a result, **Lambda functions are not currently connected to the database**. They fall back
  to the `knex.ts` defaults (`localhost`, `user`, `password`, `mydb`).
- There is **no `migrationHandler` Lambda source** anywhere in `src/`. A compiled artifact
  exists at `dist/migrationRunner/lambdaHandler.js` but has no corresponding source — it is
  stale and must be treated as non-existent.
- The dev database name on the RDS instance is `paymentportal` (not `paymentportal_dev`).

---

## Sequencing

```
Step 0 (Section A) — Credential wiring: SecretsManager → DB_* vars in Lambda runtime
                       ← prerequisite for all DB connectivity; nothing else works without this

Step 1 (Section B) — Terraform: expose dev RDS details to PR workspaces; add DB_NAME
                       ← depends on Step 0 to know which env vars to pass

Step 2 (Section C) — Create migrationHandler Lambda (new, not an extension of anything)
                       ← depends on Step 0 for DB connectivity; coordinate with PAY-053 team

Step 3 (Section D) — IAM verification: deployer + Lambda execution role permissions
                       ← verify in parallel with Step 1

Step 4 (Section E) — CI workflow: database lifecycle in cicd-dev.yml
                       ← depends on Steps 1 and 2

Step 5 (Section F) — Add DB-exercising integration tests
                       ← depends on Step 4; required by acceptance criteria

Step 6 (Section G) — Orphan database cleanup (nightly GC workflow)
                       ← add after Step 4 is validated in CI
```

---

## Section A — Credential wiring: SecretsManager → knex at Lambda runtime

**This is the most critical gap and must be resolved first.**

`knex.ts` reads individual `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` env vars
but the Lambda env only contains `RDS_ENDPOINT` and `RDS_SECRET_ARN`. There is no code that
bridges them. Until this exists, no Lambda can connect to the database.

**Tasks:**

- [ ] Add a credential-fetching module (e.g. `src/db/getRdsCredentials.ts`) that:
  1. Calls `secretsmanager:GetSecretValue` on `process.env.RDS_SECRET_ARN`
  2. Parses the returned JSON (RDS secrets contain `username`, `password`, `host`, `port`,
     `dbname` — but we override `dbname` with `process.env.DB_NAME`)
  3. Returns the connection object (`host`, `port`, `user`, `password`, `database`)
  4. Caches the result for the lifetime of the Lambda container (module-level singleton —
     cold start fetches once, warm invocations reuse it)

- [ ] Update `knex.ts` to call this module when `RDS_SECRET_ARN` is present in the env,
  falling back to the existing `DB_*` env var defaults for local development (no `RDS_SECRET_ARN`
  means local stack, keep current behaviour)

- [ ] The Lambda IAM execution role already has `secretsmanager:GetSecretValue` scoped to
  `rds!*` (the RDS-managed secret ARN prefix). Verify the dev RDS secret ARN matches this
  pattern before proceeding.

**Local dev is unaffected:** `RDS_SECRET_ARN` is absent in the local `.env`, so the existing
`DB_HOST`/`DB_USER`/etc. defaults continue to work unchanged.

---

## Section B — Terraform: expose dev RDS to PR workspaces and add DB_NAME

Currently `RDS_ENDPOINT` and `RDS_SECRET_ARN` are empty strings for PR workspaces
(`local.environment == "dev" ? ... : ""`). PR Lambdas already share the dev VPC, so network
access to the dev RDS is already in place. We need to wire the values through.

**Tasks:**

- [ ] Write the dev RDS endpoint and credentials secret ARN to SSM Parameter Store during
  the dev Terraform deployment (or expose them as Terraform remote state outputs). Suggested
  paths:
  - `/ustc/pay-gov/dev/rds-endpoint`
  - `/ustc/pay-gov/dev/rds-secret-arn`

  This avoids hardcoding values in PR workspace config and lets PR workspaces read them via
  the existing deployer IAM role without re-creating the RDS module.

- [ ] In `locals.tf`, update `lambda_env_base` for PR workspaces to read from those SSM
  parameters:
  ```hcl
  RDS_ENDPOINT   = local.environment == "dev" ? module.rds[0].endpoint : data.aws_ssm_parameter.dev_rds_endpoint.value
  RDS_SECRET_ARN = local.environment == "dev" ? module.secrets.rds_credentials_secret_arn : data.aws_ssm_parameter.dev_rds_secret_arn.value
  ```

- [ ] Add `DB_NAME` to `lambda_env_base`:
  ```hcl
  DB_NAME = local.environment == "dev" ? "paymentportal" : replace(local.environment, "-", "_")
  ```
  - Dev workspace keeps `"paymentportal"` — **do not rename the existing dev database**.
    Changing this to `"paymentportal_dev"` would try to modify a live database and break dev.
  - PR workspaces produce `"paymentportal_pr_123"` (hyphens replaced because Postgres
    database names cannot contain hyphens and `local.environment` is `"pr-<number>"`).

- [ ] Add the two SSM `data` sources to the dev environment Terraform so PR workspaces can
  resolve them at plan/apply time.

---

## Section C — Create `migrationHandler` Lambda (new)

> **Note:** There is no existing `migrationHandler` source in `src/`. The compiled artifact
> at `dist/migrationRunner/lambdaHandler.js` is stale and has no source — treat this as a
> net-new Lambda. Coordinate with the PAY-053 team to avoid duplicating work if that story
> is also creating a migration runner.

The dev RDS is in a private subnet — the GitHub Actions runner cannot reach it directly.
All database operations must go through a Lambda inside the VPC. The `migrationHandler`
Lambda will be the only mechanism for create, migrate, seed, and drop operations.

**Tasks:**

- [ ] Create `src/migrationHandler/handler.ts`. The Lambda reads `DB_NAME` and
  `RDS_SECRET_ARN` from its own env vars (set by Terraform per workspace, same mechanism as
  all other Lambdas). It accepts a `command` field in the invocation payload:

  | `command`   | Behaviour |
  |-------------|-----------|
  | `"migrate"` | Connect to `DB_NAME`, run `knex.migrate.latest()` (default if omitted) |
  | `"create-db"` | Connect to `postgres` maintenance DB, run `CREATE DATABASE IF NOT EXISTS "<DB_NAME>"` |
  | `"drop-db"` | Connect to `postgres` maintenance DB, run `DROP DATABASE IF EXISTS "<DB_NAME>" WITH (FORCE)` |
  | `"seed"` | Connect to `DB_NAME`, run `knex.seed.run()` |

- [ ] **Credentials for `create-db` and `drop-db`:** These commands connect to the
  `postgres` maintenance database, not `DB_NAME`. The RDS master user credentials (stored
  in the `rds!*` Secrets Manager secret) must be used for these operations — the application
  user is unlikely to have `CREATEDB` privilege. Fetch the master secret ARN from
  `process.env.RDS_MASTER_SECRET_ARN` (a separate env var set by Terraform) for these two
  commands only. For `migrate` and `seed`, use the application credentials from
  `RDS_SECRET_ARN` as normal.

- [ ] `DB_NAME` comes exclusively from the Lambda's own env vars — it is **never** accepted
  as a payload parameter. This ensures a PR's `migrationHandler` can only ever affect its
  own database.

- [ ] On `create-db` failure: return a non-200 response with a clear error message. The CI
  step that invokes it should check the response payload for errors and fail the workflow
  with `exit 1`. Do not leave a partial database behind (catch the error, attempt
  `DROP DATABASE IF EXISTS` as cleanup, then re-throw).

- [ ] On `drop-db`: `DROP DATABASE IF EXISTS ... WITH (FORCE)` is idempotent — safe to call
  even if the database was never created or was already dropped.

- [ ] Add `migrationHandler` to the Terraform Lambda module so it is deployed as part of
  each workspace (dev and PR).

- [ ] Add unit tests covering each command path, mocking the Knex and SecretsManager calls.

---

## Section D — IAM: verify permissions are sufficient

PR Lambdas use the shared `lambda_execution_role_arn` from the foundation remote state.
The deployer role is shared across all PR workspaces.

**Tasks:**

- [ ] Verify the Lambda execution role policy allows `secretsmanager:GetSecretValue` on both:
  - The application credentials secret (matches `rds!*` pattern — already in policy)
  - The RDS master credentials secret (also matches `rds!*` — confirm the ARN pattern)

  If `RDS_MASTER_SECRET_ARN` is a separately managed secret (not RDS-managed), add it to
  the policy explicitly.

- [ ] Verify the deployer IAM role has `lambda:InvokeFunction` on PR Lambda function names.
  The existing CI pattern already invokes Lambdas by name, so this is likely in place —
  confirm the resource ARN pattern covers `ustc-payment-processor-pr-*-migrationHandler`.

- [ ] Verify the deployer role has `ssm:GetParameter` on `/ustc/pay-gov/dev/rds-*` (needed
  for Terraform plan/apply in PR workspaces to resolve the SSM data sources from Section B).

---

## Section E — CI workflow: database lifecycle in `cicd-dev.yml`

With `migrationHandler` deployed and credential wiring in place, CI invokes it via
`aws lambda invoke` using the existing deployer IAM role.

### On PR deploy (`pr_build_test_deploy` job)

Add the following steps **after Terraform apply** and **before integration tests**:

- [ ] **Create PR database** — invoke the PR workspace's `migrationHandler` with
  `{"command":"create-db"}`. Guard with
  `if: ${{ steps.tf_outputs.outputs.has_outputs == 'true' }}`.
  Check the response payload for errors and fail fast:
  ```yaml
  - name: Create PR database
    if: ${{ steps.tf_outputs.outputs.has_outputs == 'true' }}
    run: |
      aws lambda invoke \
        --function-name ustc-payment-processor-pr-${{ github.event.pull_request.number }}-migrationHandler \
        --payload '{"command":"create-db"}' \
        --cli-binary-format raw-in-base64-out \
        response.json
      cat response.json
      # Fail the step if the Lambda returned an error payload
      if jq -e '.errorMessage' response.json > /dev/null 2>&1; then
        echo "ERROR: create-db failed"
        exit 1
      fi
  ```

- [ ] **Run migrations** — invoke the same Lambda with `{"command":"migrate"}`.
  Apply the same error-check pattern:
  ```yaml
  - name: Run migrations on PR database
    if: ${{ steps.tf_outputs.outputs.has_outputs == 'true' }}
    run: |
      aws lambda invoke \
        --function-name ustc-payment-processor-pr-${{ github.event.pull_request.number }}-migrationHandler \
        --payload '{"command":"migrate"}' \
        --cli-binary-format raw-in-base64-out \
        response.json
      cat response.json
      if jq -e '.errorMessage' response.json > /dev/null 2>&1; then
        echo "ERROR: migrate failed"
        exit 1
      fi
  ```

- [ ] **Seed PR database** — invoke with `{"command":"seed"}` to populate pre-migration
  production-shaped rows before running integration tests:
  ```yaml
  - name: Seed PR database
    if: ${{ steps.tf_outputs.outputs.has_outputs == 'true' }}
    run: |
      aws lambda invoke \
        --function-name ustc-payment-processor-pr-${{ github.event.pull_request.number }}-migrationHandler \
        --payload '{"command":"seed"}' \
        --cli-binary-format raw-in-base64-out \
        response.json
      cat response.json
      if jq -e '.errorMessage' response.json > /dev/null 2>&1; then
        echo "ERROR: seed failed"
        exit 1
      fi
  ```

**Note on re-triggering:** Because `create-db` uses `CREATE DATABASE IF NOT EXISTS`, these
steps are safe to re-run on a force-push to the same PR. The create is idempotent; migrate
is idempotent (knex tracks applied migrations); seed should either use `truncate` + re-insert
or be guarded to avoid duplicate key errors on re-run.

### On PR cleanup (`pr_cleanup` job)

Add the following step **before** `terraform destroy` — the Lambda must still exist to execute
the drop:

- [ ] **Drop PR database** — invoke the PR Lambda with `{"command":"drop-db"}`.
  Non-fatal if it fails (best-effort cleanup; orphan GC in Section G handles leftovers):
  ```yaml
  - name: Drop PR database
    if: ${{ steps.ws.outputs.no_ws != 'true' }}
    run: |
      aws lambda invoke \
        --function-name ustc-payment-processor-pr-${{ github.event.pull_request.number }}-migrationHandler \
        --payload '{"command":"drop-db"}' \
        --cli-binary-format raw-in-base64-out \
        response.json || true
      cat response.json || true
  ```

---

## Section F — DB-exercising integration tests

The current integration tests (`transaction.test.ts`, `sigv4Smoke.test.ts`) call the Pay.gov
SOAP API and do not touch the database. The acceptance criteria explicitly requires verifying
that migrations apply correctly and that the PR database is isolated from the dev database.
These tests must be added as part of this story.

**Tasks:**

- [ ] Add an integration test (e.g. `src/test/integration/migration.test.ts`) that:
  1. Calls a Lambda endpoint that reads from the `transactions` table (e.g. a
     `getTransactionsByStatus` endpoint once it is wired up) and asserts rows are returned
     matching the seeded data shape
  2. Asserts the schema matches expectations (correct columns, correct constraints) by
     querying `information_schema` or using a dedicated Lambda health-check endpoint

- [ ] Until a DB-reading Lambda endpoint exists, add a lower-level check: invoke a new
  `migrationHandler` command `"verify"` that runs `knex.migrate.currentVersion()` and
  returns it in the response payload. The CI step asserts the returned version matches
  the latest migration file timestamp.

- [ ] Verify that the integration tests run **after** the seed step so seeded data is present.

---

## Section G — Orphaned database cleanup (nightly GC)

If `pr_cleanup` fails or a PR is closed without triggering the workflow, the PR database is
left behind on the dev RDS. By that point the PR Lambda may already be destroyed, so a
different mechanism is needed.

**Design constraint:** `migrationHandler` never accepts `dbName` as a payload parameter —
doing so would let any caller drop an arbitrary database. Instead, the dev `migrationHandler`
(which is always present) gets a `"gc-pr-dbs"` command that handles the entire cleanup
internally:

- [ ] Add `"gc-pr-dbs"` command to `migrationHandler`:
  1. Connect to the `postgres` maintenance database
  2. Query `pg_database` for names matching `paymentportal_pr_%`
  3. For each matching name, extract the PR number from the name
  4. Call the GitHub API (`https://api.github.com/repos/{owner}/{repo}/pulls/{number}`) to
     check if the PR is closed or merged
  5. For any closed/merged PR, run `DROP DATABASE IF EXISTS "paymentportal_pr_{number}" WITH (FORCE)`
  6. Return a summary of which databases were dropped

  The Lambda reads a `GITHUB_TOKEN` from Secrets Manager (or from `process.env`) to
  authenticate the GitHub API call. Scope it to `contents: read` — it only needs to check
  PR state.

- [ ] Add a scheduled GitHub Actions workflow (e.g. `.github/workflows/gc-pr-dbs.yml`) that
  runs nightly:
  ```yaml
  - name: GC orphaned PR databases
    run: |
      aws lambda invoke \
        --function-name ustc-payment-processor-migrationHandler \
        --payload '{"command":"gc-pr-dbs"}' \
        --cli-binary-format raw-in-base64-out \
        response.json
      cat response.json
  ```

---

## Open questions

1. **Master credentials ARN format:** Confirm whether the RDS master secret ARN follows the
   `rds!*` prefix (RDS-managed rotation secret) or is a manually managed secret. This
   determines whether the existing IAM policy covers it or needs updating.

2. **`getTransactionsByStatus` Lambda endpoint:** This use case exists in the source but is
   not wired to any Lambda handler. Determine if wiring it up is in scope for this story or
   a prerequisite from PAY-052/053, as it is the most natural endpoint to drive DB
   integration tests against.

3. **Seed idempotency on re-trigger:** Decide whether seeds use `ON CONFLICT DO NOTHING`
   (idempotent, preferred) or truncate-and-reseed (destructive but clean). The current
   `db/seeds/01_transactions.ts` does a plain insert — this needs updating before it is safe
   to re-run on force-push.
