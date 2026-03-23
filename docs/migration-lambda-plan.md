# Migration Lambda — Implementation Plan
**Remove this doc before PR Merge**
## Overview

Add a `migrationRunner` Lambda that runs `knex migrate:latest` against the hosted RDS instance
on every deployment. The Lambda runs inside the VPC (where it can reach the private RDS) and is
invoked by the CI/CD deployer role immediately after `terraform apply` completes.

**Seeds are explicitly excluded from CI/CD.** The existing seed ([db/seeds/01_transactions.ts](../db/seeds/01_transactions.ts))
truncates the `transactions` table before inserting fake data — running it in CI would destroy real records on every
merge. Seeds remain a manual, dev-only operation.

---

## Architecture Summary

```
GitHub Actions (cicd-dev.yml)
  └── terraform apply
        └── provisions migrationRunner Lambda (VPC, RDS access)
  └── aws lambda invoke migrationRunner   ← NEW step
        └── migrationRunner Lambda (inside VPC)
              └── Secrets Manager (RDS credentials)
              └── RDS Postgres (knex.migrate.latest)
```

---

## Task Breakdown

Tasks are ordered by dependency. Tasks 1–3 are pure source changes and can be done in parallel.
Tasks 4–6 are Terraform changes and should be reviewed together. Task 7 is the CI/CD wiring and
depends on Tasks 4–6 being complete and plannable.

---

### Task 1 — Create `src/migrationHandler.ts`

**Type:** New source file
**Files touched:** `src/migrationHandler.ts`
**Depends on:** Nothing

Create the migration handler. It reads RDS credentials from Secrets Manager (using the
`RDS_SECRET_ARN` env var already present on all Lambdas) and the RDS endpoint from
`RDS_ENDPOINT`, creates a short-lived Knex connection, runs `migrate.latest()`, then
destroys the connection before returning.

This handler does **not** go through the existing `lambdaHandler` wrapper — it has no API
Gateway event, no SigV4 auth, and no `appContext`. It is invoked directly by the AWS CLI.

**Implementation notes:**
- Import `SecretsManagerClient` from `@aws-sdk/client-secrets-manager` (already a dependency).
- `RDS_ENDPOINT` is in `host:port` format — split on `:` to get host and port separately.
- The RDS credentials secret stored in Secrets Manager has shape `{ username, password }` —
  matches the format set in [terraform/environments/dev/main.tf](../terraform/environments/dev/main.tf#L26-L29).
- Point migrations directory at `./db/migrations` (relative to the bundled output).
- Always call `knex.destroy()` in a `finally` block to prevent Lambda from hanging on open
  connections.
- Return `{ statusCode: 200, body: string }` on success; throw (let Lambda report failure) on
  any error so CI sees a non-zero exit.
- Do **not** call `seed.run()`.

**Acceptance criteria:**
- [ ] Handler exports a named `migrationHandler` function.
- [ ] Connects using `RDS_SECRET_ARN` + `RDS_ENDPOINT` env vars, not plain `DB_*` vars.
- [ ] Returns `{ statusCode: 200 }` when migrations are already up to date (idempotent).
- [ ] Destroys the Knex connection in a `finally` block.
- [ ] Has a unit test that mocks Secrets Manager and asserts `migrate.latest()` is called.

---

### Task 2 — Update `terraform/scripts/build-lambda.sh`

**Type:** Build script update
**Files touched:** `terraform/scripts/build-lambda.sh`
**Depends on:** Task 1 (the source file must exist)

Add an esbuild step for `migrationRunner`, following the identical pattern as the existing four
functions. The entry point is `src/migrationHandler.ts` and the output goes to
`dist/migrationRunner/lambdaHandler.js`.

**Implementation notes:**
- Copy the `initPayment` esbuild block verbatim and change:
  - `--outfile` → `dist/migrationRunner/lambdaHandler.js`
  - Entry point → `src/migrationHandler.ts`
- The `db/migrations` directory must be included in the bundle. Because esbuild doesn't
  auto-include non-JS assets, the migration files need to be either:
  - **Option A (recommended):** copied into `dist/migrationRunner/db/migrations/` as a
    post-build step in the script (same pattern as the `certs/` copy that already exists).
  - **Option B:** imported statically in the handler so esbuild bundles them.
  Option A is simpler and consistent with the existing cert-copy pattern.
- Update the summary echo lines at the bottom of the script to include `migrationRunner`.
- The upload script (`upload_lambda_artifacts_s3.sh`) loops over `dist/*` dynamically — it
  will pick up `migrationRunner` automatically with no changes needed.

**Acceptance criteria:**
- [ ] `npm run build:lambda` produces `dist/migrationRunner/lambdaHandler.js`.
- [ ] `dist/migrationRunner/db/migrations/` contains all migration files.
- [ ] Bundle size printed in the build summary.

---

### Task 3 — Update Terraform Lambda Module to Support Per-Function Timeout

**Type:** Terraform module update
**Files touched:** `terraform/modules/lambda/main.tf`
**Depends on:** Nothing

The `migrationRunner` Lambda needs a longer timeout than the default 3 seconds (knex connect +
migrate can take 5–30s on a cold start). The cleanest approach is to make `timeout` an optional
attribute in the existing `lambda_functions` map so each function can opt in without affecting
the others.

**Implementation notes:**

In `main.tf`, add `migrationRunner` to `local.lambda_functions` with an optional `timeout`
field. Existing entries are left as-is — no timeout change for functions that don't need one.

```hcl
locals {
  lambda_functions = {
    initPayment = {
      handler = "lambdaHandler.initPaymentHandler"
    }
    processPayment = {
      handler = "lambdaHandler.processPaymentHandler"
    }
    getDetails = {
      handler = "lambdaHandler.getDetailsHandler"
    }
    testCert = {
      handler = "lambdaHandler.handler"
    }
    migrationRunner = {
      handler = "lambdaHandler.migrationHandler"
      timeout = 120
    }
  }
}
```

In the `aws_lambda_function` resource, add a conditional timeout that only applies when set:
```hcl
timeout = try(each.value.timeout, null)
```

Using `try(..., null)` means Terraform omits the attribute for functions that don't define it,
leaving them on the AWS default (3s) — no diff on existing resources.

**Acceptance criteria:**
- [ ] `migrationRunner` Lambda has a 120-second timeout in Terraform.
- [ ] `terraform plan` shows **no changes** to existing Lambda functions.
- [ ] Existing functions continue using the AWS default timeout.

---

### Task 4 — Update `terraform/environments/dev/variables.tf`

**Type:** Terraform variable declaration
**Files touched:** `terraform/environments/dev/variables.tf`
**Depends on:** Nothing (can be done in parallel with Task 3)

Add the two new input variables that Terraform needs to receive from CI for the
`migrationRunner` artifact, following the exact pattern of the existing four functions.

Add to `variables.tf`:

```hcl
variable "migrationRunner_s3_key" {
  description = "S3 key for migrationRunner Lambda artifact"
  type        = string
  default     = ""
}

variable "migrationRunner_source_code_hash" {
  description = "Base64-encoded SHA256 hash for migrationRunner artifact"
  type        = string
  default     = ""
}
```

**Acceptance criteria:**
- [ ] Two new variables declared, matching the naming convention of existing variables.
- [ ] `terraform validate` passes.

---

### Task 5 — Wire `migrationRunner` into `terraform/environments/dev/main.tf`

**Type:** Terraform wiring
**Files touched:** `terraform/environments/dev/main.tf`
**Depends on:** Tasks 3 and 4

Thread the new artifact variables from Task 4 into the `module "lambda"` call so Terraform
knows which S3 artifact to deploy for `migrationRunner`.

In the `module "lambda"` block, add to both maps:

```hcl
artifact_s3_keys = {
  initPayment        = var.initPayment_s3_key
  processPayment     = var.processPayment_s3_key
  getDetails         = var.getDetails_s3_key
  testCert           = var.testCert_s3_key
  migrationRunner    = var.migrationRunner_s3_key   # ← add
}
source_code_hashes = {
  initPayment        = var.initPayment_source_code_hash
  processPayment     = var.processPayment_source_code_hash
  getDetails         = var.getDetails_source_code_hash
  testCert           = var.testCert_source_code_hash
  migrationRunner    = var.migrationRunner_source_code_hash   # ← add
}
```

**Acceptance criteria:**
- [ ] `terraform plan` with dummy variable values shows a new Lambda being created named
  `*-migrationRunner`.
- [ ] No changes to existing Lambda resources in the plan output.
- [ ] CloudWatch log group for `/aws/lambda/*-migrationRunner` is created automatically
  (the `for_each` in the module covers this already).

---

### Task 6 — Add `lambda:InvokeFunction` to the CI/CD Deployer IAM Role

**Type:** IAM policy update
**Files touched:** `terraform/modules/iam/main.tf`
**Depends on:** Nothing (can be done in parallel)

The CI/CD deployer role currently has `lambda:CreateFunction`, `lambda:UpdateFunctionCode`,
and other management actions — but **not** `lambda:InvokeFunction`. The new CI step that
calls `aws lambda invoke` will fail with `AccessDenied` without this.

In the `aws_iam_role_policy.github_actions_permissions` resource, add `lambda:InvokeFunction`
to the existing Lambda action block:

```hcl
Action = [
  "lambda:CreateFunction",
  "lambda:UpdateFunctionCode",
  ...existing actions...,
  "lambda:InvokeFunction"   # ← add
],
Resource = "arn:aws:lambda:${local.aws_region}:${data.aws_caller_identity.current.account_id}:function:ustc-payment-processor*"
```

The resource ARN pattern `ustc-payment-processor*` already covers the migration Lambda since
all functions share the same prefix.

**Acceptance criteria:**
- [ ] `lambda:InvokeFunction` added to the deployer role policy.
- [ ] Resource scope unchanged (still scoped to `ustc-payment-processor*`).
- [ ] `terraform plan` shows only a policy update, no role recreation.

---

### Task 7 — Update `.github/workflows/cicd-dev.yml`

**Type:** CI/CD pipeline update
**Files touched:** `.github/workflows/cicd-dev.yml`
**Depends on:** Tasks 4–6 merged and deployed to the dev Terraform state

This is the final wiring task. Three changes are needed in the workflow file.

---

#### 7a — Add `TF_VAR_migrationRunner_*` to Terraform Plan/Apply steps

Both the `pr_build_test_deploy` job and the `deploy_dev` job have explicit `env:` blocks for
`TF_VAR_*` in their Plan and Apply steps. Add the two new variables to each block.

In `pr_build_test_deploy` → **Terraform Plan** and **Terraform Apply** `env:` blocks:
```yaml
TF_VAR_migrationRunner_s3_key: ${{ steps.upload_artifacts_pr.outputs.migrationRunner_s3_key }}
TF_VAR_migrationRunner_source_code_hash: ${{ steps.upload_artifacts_pr.outputs.migrationRunner_source_code_hash }}
```

In `deploy_dev` → **Terraform Plan (dev)** and **Terraform Apply (dev)** `env:` blocks:
```yaml
TF_VAR_migrationRunner_s3_key: ${{ steps.promote_artifacts.outputs.migrationRunner_s3_key }}
TF_VAR_migrationRunner_source_code_hash: ${{ steps.promote_artifacts.outputs.migrationRunner_source_code_hash }}
```

> The upload and promote scripts loop over `dist/*` dynamically and already emit
> `migrationRunner_s3_key` and `migrationRunner_source_code_hash` as step outputs — no
> changes needed to those scripts.

---

#### 7b — Add "Run DB Migrations" step in `pr_build_test_deploy`

Insert this step **after** "Terraform Apply (if required)" and **before** "Smoke check":

```yaml
- name: Run DB migrations
  if: ${{ steps.plan.outputs.exitcode == '2' || steps.plan.outputs.exitcode == '0' }}
  working-directory: terraform/environments/dev
  run: |
    FUNCTION_NAME=$(terraform output -raw migration_runner_function_name 2>/dev/null \
      || echo "ustc-payment-processor-${TF_VAR_namespace}-migrationRunner")
    echo "Invoking migration Lambda: $FUNCTION_NAME"

    aws lambda invoke \
      --function-name "$FUNCTION_NAME" \
      --payload '{}' \
      --cli-binary-format raw-in-base64-out \
      --log-type Tail \
      response.json \
      | tee invoke-meta.json

    echo "--- Lambda response ---"
    cat response.json

    # Surface any Lambda-reported function error
    if jq -e '.FunctionError' invoke-meta.json > /dev/null 2>&1; then
      echo "ERROR: Lambda reported a function error"
      exit 1
    fi
```

---

#### 7c — Add "Run DB migrations" step in `deploy_dev`

Insert this step **after** "Terraform Apply (dev)" and **before** "Get API URL (dev)":

```yaml
- name: Run DB migrations (dev)
  working-directory: terraform/environments/dev
  run: |
    FUNCTION_NAME=$(terraform output -raw migration_runner_function_name)
    echo "Invoking migration Lambda: $FUNCTION_NAME"

    aws lambda invoke \
      --function-name "$FUNCTION_NAME" \
      --payload '{}' \
      --cli-binary-format raw-in-base64-out \
      --log-type Tail \
      response.json \
      | tee invoke-meta.json

    echo "--- Lambda response ---"
    cat response.json

    if jq -e '.FunctionError' invoke-meta.json > /dev/null 2>&1; then
      echo "ERROR: Lambda reported a function error"
      exit 1
    fi
```

---

#### 7d — Add Terraform output for function name

To avoid hardcoding the function name in the CI step, add a Terraform output in
`terraform/environments/dev/outputs.tf`:

```hcl
output "migration_runner_function_name" {
  description = "Name of the migration runner Lambda function"
  value       = module.lambda.function_names["migrationRunner"]
}
```

This requires `function_names` to be exposed from the Lambda module output. Check
`terraform/modules/lambda/outputs.tf` — if it only exports ARNs, add a `function_names`
output there as well:

```hcl
output "function_names" {
  description = "Map of function key to function name"
  value       = { for k, v in aws_lambda_function.functions : k => v.function_name }
}
```

**Acceptance criteria for Task 7:**
- [ ] Both Plan and Apply steps in both CI jobs include `migrationRunner` TF vars.
- [ ] Migration step runs after `terraform apply` in both `pr_build_test_deploy` and
  `deploy_dev` jobs.
- [ ] CI step fails if Lambda returns a `FunctionError` (e.g. migration fails mid-run).
- [ ] Migration step is skipped on the `pr_cleanup` (destroy) job — it should not be added
  there.
- [ ] A successful run logs `Migrations complete` or `Already up to date` to CloudWatch.

---

## Rollout Order

```
Part 1
  ├── Task 1  (migrationHandler.ts)       → any engineer
  ├── Task 2  (build-lambda.sh)           → any engineer (unblock after Task 1)
  ├── Task 3  (lambda module timeout)     → any engineer
  ├── Task 4  (dev variables.tf)          → any engineer
  └── Task 6  (IAM InvokeFunction)        → any engineer

Part 2 — PR / review
  └── Task 5  (dev main.tf wiring)        → needs Tasks 3 + 4 in same PR or merged first

Part 3
  └── Task 7  (cicd-dev.yml)              → needs Tasks 4–6 merged to main and applied to dev
```

Tasks 1–4 and 6 have no inter-dependencies and can be opened as separate PRs or combined into
one. Task 5 logically belongs in the same PR as Tasks 3 and 4. Task 7 should be its own PR,
opened only after the Terraform changes have been applied to dev so the new Lambda actually
exists when the workflow tries to invoke it.

---

## What Is Intentionally Out of Scope

| Item | Reason |
|---|---|
| Running `seed:run` in CI | Seeds truncate real data; dev-only manual operation |
| Staging / prod CI changes | Follow the same pattern in `staging-deploy.yml` and `prod-deploy.yml` as a separate ticket after dev is proven |
| Migration rollback in CI | Rollback is a break-glass operation; it should be triggered manually, not automatically |
| Separate migration Lambda per environment | All environments use the same function code; environment is determined by env vars passed at deploy time |
