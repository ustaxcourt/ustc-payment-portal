# PAY-052: Ephemeral PR Environment — RDS Isolation via Per-PR Database
**Delete before merging (working document to track what needs to be done in this story)**
## Overview

Integration tests for PR environments need DB access to verify the transaction tracking
acceptance criteria (Section 9 of PAY-052-init-transaction-tracking.md). This plan covers
giving each ephemeral PR environment its own database on the shared dev RDS instance, keeping
the dev `paymentportal_dev` database untouched.

**RDS instance:** Shared dev RDS (Postgres 16.6) — `DROP DATABASE WITH (FORCE)` is supported.

**Approach:** Each PR gets a dedicated database (e.g. `paymentportal_pr_123`) on the dev RDS.
The PR Lambda is pointed at that database via a `DB_NAME` env var. The database is created
before migrations run and dropped on PR close.

---

## Why a separate database over PostgreSQL schemas

- A connection scoped to `paymentportal_pr_123` physically cannot touch `paymentportal_dev`
  tables, even via unqualified `knex.raw` queries — stronger isolation than `searchPath`
- No `searchPath` plumbing needed in `knexConfig.ts` — `DB_NAME` is already read from the
  environment and the config already supports it
- Cleaner mental model for developers

---

## Section A — Terraform: pass dev RDS connection details to PR Lambda environments

Currently in `terraform/environments/dev/locals.tf`, `RDS_ENDPOINT` and `RDS_SECRET_ARN`
are empty strings for PR workspaces (`local.environment == "dev" ? ... : ""`). PR Lambdas
already share the dev VPC (`private_subnet_id` and `lambda_security_group_id` from foundation
remote state), so network access to the dev RDS is already in place.

**Tasks:**
- [ ] Expose the dev RDS endpoint and credentials secret ARN as outputs from the dev Terraform
  workspace (or store them in SSM Parameter Store on dev deploy) so PR workspaces can reference
  them without re-creating the RDS module
- [ ] In `locals.tf`, set `RDS_ENDPOINT` and `RDS_SECRET_ARN` for PR workspaces to point at
  the shared dev RDS values (read from the SSM parameters or passed in as Terraform variables)
- [ ] Add `DB_NAME` to `lambda_env_base`:
  ```hcl
  DB_NAME = local.environment == "dev" ? "paymentportal_dev" : replace(local.environment, "-", "_")
  ```
  This produces `paymentportal_dev` for the dev workspace and `paymentportal_pr_123` for PR
  workspaces. The `replace` is needed because Postgres database names cannot contain hyphens
  and `local.environment` is `pr-<number>`.

---

## Section B — `knexConfig.ts`: no changes needed

`knexConfig.ts` already reads `DB_NAME` from the environment and uses it as the database name
in the connection config. Since `DB_NAME` will be set correctly per environment via Terraform,
no code changes are needed here.

---

## Section C — Extend `migrationHandler` to support create and drop

The dev RDS is in a private subnet — the GitHub Actions runner cannot reach it directly.
All DB operations must go through a Lambda inside the VPC. The `migrationHandler` (from
PAY-053) runs `knex.migrate.latest()` and already reads `RDS_DB_NAME` from its env vars,
meaning each PR's deployed Lambda already targets its own database. However it currently
only supports running migrations — it has no `create-db` or `drop-db` capability.

**Tasks:**
- [ ] Extend `migrationHandler` to accept an optional `command` field in the invocation
  payload: `"migrate"` (default, existing behaviour), `"create-db"`, and `"drop-db"`
- [ ] For `"create-db"`: connect to the default `postgres` maintenance database (same
  RDS credentials) and run `CREATE DATABASE <RDS_DB_NAME>`
- [ ] For `"drop-db"`: connect to the `postgres` maintenance database and run
  `DROP DATABASE IF EXISTS <RDS_DB_NAME> WITH (FORCE)`
- [ ] `RDS_DB_NAME` continues to come from the Lambda's env vars (set by Terraform per
  workspace) — no need to accept it as a payload parameter

---

## Section D — CI workflow: database lifecycle in `cicd-dev.yml`

With the extended `migrationHandler` in place, CI invokes it via `aws lambda invoke` using
the existing deployer IAM role. The PR Lambda function name follows the existing
`name_prefix` pattern from `locals.tf` (`ustc-payment-processor-pr-<number>`).

### On PR deploy (`pr_build_test_deploy` job)

Add the following steps after Terraform apply and before integration tests:

- [ ] **Create PR database** — invoke the PR workspace's `migrationHandler` with
  `{"command": "create-db"}`. Guard with
  `if: ${{ steps.tf_outputs.outputs.has_outputs == 'true' }}`:
  ```yaml
  - name: Create PR database
    run: |
      aws lambda invoke \
        --function-name ustc-payment-processor-pr-${{ github.event.pull_request.number }}-migrationHandler \
        --payload '{"command":"create-db"}' \
        --cli-binary-format raw-in-base64-out \
        response.json
      cat response.json
  ```

- [ ] **Run migrations** — invoke the same Lambda with `{"command": "migrate"}`:
  ```yaml
  - name: Run migrations on PR database
    run: |
      aws lambda invoke \
        --function-name ustc-payment-processor-pr-${{ github.event.pull_request.number }}-migrationHandler \
        --payload '{"command":"migrate"}' \
        --cli-binary-format raw-in-base64-out \
        response.json
      cat response.json
  ```

- [ ] **Run seeds** (optional) — add a `"seed"` command to `migrationHandler` and invoke
  it here to populate the PR database with realistic test data.

### On PR cleanup (`pr_cleanup` job)

Add the following step **before** `terraform destroy` (the Lambda must still exist to
execute the drop):

- [ ] **Drop PR database** — invoke the PR Lambda with `{"command": "drop-db"}`:
  ```yaml
  - name: Drop PR database
    if: ${{ steps.ws.outputs.no_ws != 'true' }}
    run: |
      aws lambda invoke \
        --function-name ustc-payment-processor-pr-${{ github.event.pull_request.number }}-migrationHandler \
        --payload '{"command":"drop-db"}' \
        --cli-binary-format raw-in-base64-out \
        response.json
      cat response.json
  ```

---

## Section D — IAM: Lambda execution role permissions

PR Lambdas use the same `lambda_execution_role_arn` from the foundation remote state as the
dev Lambda. Verify the following are already in place:

- [ ] `secretsmanager:GetSecretValue` on the RDS credentials secret ARN — needed for the
  Lambda to read DB credentials at runtime
- [ ] If the RDS credentials secret ARN is scoped to a specific dev-only resource ARN in the
  policy, it may need widening or PR environments need the secret ARN passed directly rather
  than looked up by name

---

## Section E — IAM: Lambda execution role permissions

PR Lambdas use the same `lambda_execution_role_arn` from the foundation remote state as the
dev Lambda.

- [ ] Verify `secretsmanager:GetSecretValue` on the RDS credentials secret ARN is in the
  Lambda execution role policy and is not scoped to dev-only resource ARNs — PR Lambdas
  need to read the same secret to connect to the dev RDS
- [ ] Verify the deployer IAM role has `lambda:InvokeFunction` on the PR Lambda function
  names (already expected given the existing CI pattern)

---

## Section F — Orphaned database cleanup

If the `pr_cleanup` job fails or a PR is closed without triggering the workflow, the PR
database is left behind on the dev RDS. By the time cleanup is needed the PR Lambda may
already be destroyed, so orphan cleanup needs a different mechanism.

- [ ] Add a scheduled GitHub Actions workflow (e.g. nightly) that:
  1. Queries the GitHub API for all closed PRs
  2. Invokes the **dev** `migrationHandler` Lambda (always present) with a new
     `"list-dbs"` command to retrieve databases matching `paymentportal_pr_*`
  3. For each database whose PR number is closed, invokes the dev `migrationHandler`
     with `{"command": "drop-db", "dbName": "paymentportal_pr_<number>"}` — this
     requires `migrationHandler` to also accept an optional `dbName` payload override
     for the orphan cleanup case only

---

## Sequencing

```
Section C (extend migrationHandler)  ← prerequisite for everything else; coordinate with PAY-053 team
Section A (Terraform)                ← expose dev RDS to PR workspaces; add DB_NAME + RDS_DB_NAME
Section B (knexConfig)               ← no changes needed
Section E (IAM check)                ← verify in parallel with A
Section D (CI workflow)              ← depends on A and C
Section F (orphan GC)                ← add after D is working and validated
```

---

## Open question

The dev RDS endpoint needs to be accessible to PR workspace Terraform without being
hardcoded. The recommended approach is to have the dev Terraform deployment write the
RDS endpoint to SSM Parameter Store (e.g. `/ustc/pay-gov/dev/rds-endpoint`) so PR
workspaces can read it via the existing deployer IAM role without re-creating the RDS module.
