# PAY-318 / PAY-263 — Add Native Terraform Tests

> **User story:** As a Developer, so that I can validate Terraform architecture
> changes, I need to set up and add native Terraform Tests.

## 1. Context & constraints (grounded in this repo)

- **Terraform `~> 1.14.0`** ([terraform/versions.tf](../../terraform/versions.tf)) — the native `terraform test` framework (`.tftest.hcl`) and `mock_provider` blocks (GA since 1.7) are fully available. No new tooling required.
- **AWS provider `~> 5.0`**, plus `archive ~> 2.4`.
- **10 modules**, all following the same `main.tf / variables.tf / outputs.tf / versions.tf` shape. AC targets 7: `rds`, `iam`, `secrets`, `networking`, `artifacts_bucket`, `api-gateway`, `lambda`.
- **No existing test scaffolding** — this is greenfield.
- **Scope guardrail (from the ticket):** tests run **locally, not in CI/CD**, use `mock_provider "aws" {}`, and require **no AWS credentials**. That means: `command = plan` assertions only — no `apply`, no real API calls.
- There is already **real logic worth testing**, e.g. the PAY-059 regression in [terraform/modules/rds/main.tf](../../terraform/modules/rds/main.tf): `password = var.manage_master_user_password ? null : var.password` and the paired `manage_master_user_password` null-omission. Also `count`-based toggles (`enable_mtls`, `create_rds_secret` in [terraform/modules/secrets/main.tf](../../terraform/modules/secrets/main.tf)), `max_allocated_storage > 0 ? … : null`, and computed name/tag locals.

## 2. Guiding principles

1. **Test module logic, not the AWS provider.** Assert on *inputs Terraform computes* — conditionals, `count`/`for_each` cardinality, `local` values, name/tag interpolation, `merge()` results, validation blocks. Don't assert on values only known post-apply.
2. **`plan`-only + mocked provider** → deterministic, offline, fast, zero-cost. This directly satisfies AC #1.
3. **Regression-first.** Every known past incident (PAY-059) gets a named test that would have failed before the fix. This is the ticket's stated motivation.
4. **One test file per module, co-located**, mirroring the "tests live alongside source" convention already used for TS.
5. **Convention over volume.** Establish a repeatable pattern in the first module so the remaining six are mechanical.

## 3. Directory & file layout

Terraform auto-discovers `*.tftest.hcl` in the module root and in a `tests/` subdir. Use a `tests/` subdir per module to keep roots clean:

```
terraform/modules/
  rds/
    tests/
      rds.tftest.hcl
      setup/            # optional helper module for computed fixtures
  secrets/
    tests/secrets.tftest.hcl
  iam/tests/iam.tftest.hcl
  networking/tests/networking.tftest.hcl
  artifacts_bucket/tests/artifacts_bucket.tftest.hcl
  api-gateway/tests/api-gateway.tftest.hcl
  lambda/tests/lambda.tftest.hcl
terraform/
  tests/README.md        # how to run, conventions, what to assert on
```

## 4. Canonical test pattern (the template)

Each file gets a shared `mock_provider` + one `run` block per behavior. Skeleton:

```hcl
mock_provider "aws" {}

run "defaults_produce_expected_names_and_tags" {
  command = plan
  variables { /* minimal required inputs */ }

  assert {
    condition     = aws_db_instance.main.identifier == var.identifier
    error_message = "DB identifier should match the identifier var"
  }
}

run "manage_master_password_omits_inline_password" {   # PAY-059 regression
  command = plan
  variables { manage_master_user_password = true, password = "should-be-ignored" }

  assert {
    condition     = aws_db_instance.main.password == null
    error_message = "password must be null when manage_master_user_password is true (PAY-059)"
  }
  assert {
    condition     = aws_db_instance.main.manage_master_user_password == true
    error_message = "manage_master_user_password must be set when enabled"
  }
}
```

## 5. Per-module test matrix (what to actually assert)

| Module | Key behaviors to cover |
|---|---|
| **rds** | PAY-059: `password`/`manage_master_user_password` mutual exclusion (both branches); `max_allocated_storage > 0 ? x : null` (both branches); parameter group family/params; tag `merge` includes `Name`; `ignore_changes` presence. |
| **secrets** | `enable_mtls` toggles private_key/certificate count 0↔1; `create_rds_secret` toggle; `local.basepath` interpolation (`ustc/pay-gov/<env>`); seeded `[]` versions exist for `client_permissions` / `allowed_account_ids`. |
| **iam** | Role name prefixes; read-only vs deployer vs lambda role separation; policy documents scope to expected ARN patterns; `locals` assembly. |
| **networking** | Subnet/SG counts derived from inputs; CIDR interpolation; outputs wired. |
| **artifacts_bucket** | Bucket naming; versioning/encryption/public-access-block flags set as expected. |
| **api-gateway** | Stage/route wiring; SigV4/auth-related settings; name interpolation. |
| **lambda** | `archive` packaging inputs; env var assembly; handler/runtime; role ARN wiring. |
| **(all)** | At least one `expect_failures` test per module that has a `validation` block, asserting bad input is rejected. |

## 6. Execution & developer workflow

- Run a single module: `cd terraform/modules/rds && terraform init -backend=false && terraform test`
- The `-backend=false` init keeps it fully offline (no state bucket needed).
- Add convenience npm scripts to [package.json](../../package.json), mirroring the existing `migrate:*` style:
  - `tf:test` → loops modules running `terraform test`
  - `tf:test:rds` → single module
- **Explicitly keep this out of CI** for now (per the ticket: "would not run in CI/CD… at least for starters"). Document that decision in the README so it's a deliberate choice, not an omission.

## 7. Sequenced delivery (incremental, reviewable PRs)

1. **Spike + pattern (rds):** add `terraform/tests/README.md` + the full `rds` test file including the PAY-059 regression. This proves the toolchain end-to-end and sets the reviewable template. ← highest value, do first.
2. **secrets + artifacts_bucket:** high conditional/`count` density, easy wins.
3. **iam + networking:** more assertions, mock any cross-module data.
4. **api-gateway + lambda:** most wiring-heavy; may need small `setup/` fixture modules for computed inputs.
5. **DX polish:** npm scripts + AGENTS.md note documenting the `plan`-only/`mock_provider` convention and the "not in CI yet" decision.

## 8. Detailed implementation steps

### Step 0: Pre-flight checks (once)

1. Confirm local Terraform version is `1.14.x`.
2. Confirm no AWS credentials are required/used for this workflow.
3. Confirm the seven in-scope modules exist and have no `*.tftest.hcl` files yet.
4. Create a short branch-level checklist and treat each module as a discrete deliverable.

### Step 1: Establish the baseline pattern in `rds`

1. Add `terraform/modules/rds/tests/rds.tftest.hcl`.
2. Add top-level `mock_provider "aws" {}`.
3. Add a happy-path `run` block with minimum required variables.
4. Add the PAY-059 regression `run` block asserting:
  - `password == null` when `manage_master_user_password = true`.
  - `manage_master_user_password == true` when enabled.
5. Add branch-coverage `run` blocks for:
  - `max_allocated_storage > 0` path.
  - `max_allocated_storage <= 0` (null omission) path.
6. Run `terraform init -backend=false` and `terraform test` inside the module.
7. Capture final pass output in PR notes.

### Step 2: Add coverage for `secrets` and `artifacts_bucket`

1. Create `secrets/tests/secrets.tftest.hcl` and `artifacts_bucket/tests/artifacts_bucket.tftest.hcl`.
2. For `secrets`, add tests for `enable_mtls` and `create_rds_secret` toggle behavior.
3. For `secrets`, assert seeded `secret_version` resources are created with `[]`.
4. For `artifacts_bucket`, assert naming, encryption, versioning, and public-access protections.
5. Execute `terraform test` in each module and fix flaky/unknown assertions by focusing on plan-known values.

### Step 3: Add coverage for `iam` and `networking`

1. Create `iam/tests/iam.tftest.hcl` and `networking/tests/networking.tftest.hcl`.
2. For `iam`, validate role naming conventions and policy scope assembly.
3. For `networking`, validate subnet/security-group structure derived from inputs.
4. Add at least one negative/validation failure case where validation blocks exist.
5. Run tests per module and ensure deterministic local execution.

### Step 4: Add coverage for `api-gateway` and `lambda`

1. Create `api-gateway/tests/api-gateway.tftest.hcl` and `lambda/tests/lambda.tftest.hcl`.
2. For `api-gateway`, validate stage/route/auth wiring expressed in plan-known attributes.
3. For `lambda`, validate handler/runtime/env var assembly and role/archive wiring.
4. If needed, add small fixture inputs or `override_*` stubs to avoid unknown-value assertions.
5. Run tests for both modules and stabilize to pass consistently.

### Step 5: Developer ergonomics and documentation

1. Add `terraform/tests/README.md` with:
  - local-only scope,
  - command examples,
  - assertion style guidance,
  - troubleshooting for unknown values.
2. Add npm scripts in `package.json`:
  - `tf:test` (all in-scope modules),
  - module-specific scripts (e.g., `tf:test:rds`).
3. Confirm scripts run from repo root and fail fast on first failing module.

### Step 6: Final validation and handoff

1. Run all new Terraform tests from a clean working tree.
2. Verify no CI wiring was introduced.
3. Verify docs are accurate and commands are copy-paste runnable.
4. Prepare PR summary with:
  - module-by-module coverage table,
  - PAY-059 regression test reference,
  - known limitations/future enhancements.

## 9. Module-by-module execution checklist

### `rds`

1. Add file `tests/rds.tftest.hcl`.
2. Add default plan run.
3. Add PAY-059 regression run.
4. Add `max_allocated_storage` two-branch runs.
5. Run module tests and capture pass.

### `secrets`

1. Add file `tests/secrets.tftest.hcl`.
2. Add `enable_mtls=false` run (`count=0` resources absent).
3. Add `enable_mtls=true` run (`count=1` resources present).
4. Add `create_rds_secret` both-branch runs.
5. Run module tests and capture pass.

### `iam`

1. Add file `tests/iam.tftest.hcl`.
2. Add role naming assertions.
3. Add policy-scope assertions.
4. Add one validation failure test if applicable.
5. Run module tests and capture pass.

### `networking`

1. Add file `tests/networking.tftest.hcl`.
2. Add subnet derivation assertions.
3. Add SG rule/wiring assertions.
4. Add one validation failure test if applicable.
5. Run module tests and capture pass.

### `artifacts_bucket`

1. Add file `tests/artifacts_bucket.tftest.hcl`.
2. Add bucket naming assertions.
3. Add encryption/versioning assertions.
4. Add public-access-block assertions.
5. Run module tests and capture pass.

### `api-gateway`

1. Add file `tests/api-gateway.tftest.hcl`.
2. Add stage/deployment wiring assertions.
3. Add auth integration assertions.
4. Add validation failure case if present.
5. Run module tests and capture pass.

### `lambda`

1. Add file `tests/lambda.tftest.hcl`.
2. Add runtime/handler assertions.
3. Add env-var merge/wiring assertions.
4. Add role/archive wiring assertions.
5. Run module tests and capture pass.

## 10. Risks & mitigations

- **Over-mocking hides real drift.** Mitigation: keep assertions on Terraform-computed logic, not provider behavior; the goal is catching config/logic regressions like PAY-059, not validating AWS.
- **`mock_provider` gaps for computed attributes.** Some attributes are unknown at plan time under mocks; use `override_resource`/`override_data` or `setup` modules to supply deterministic values where an assertion needs them.
- **Cross-module `terraform_remote_state` reads** (foundation outputs) aren't available offline. Mitigation: test modules in isolation with injected variables; don't test the composed environment stacks in this ticket.
- **Version drift.** Pin behavior to `~> 1.14`; note in the README that `terraform test` semantics can change across minor versions.

## 11. Definition of done

- All 7 AC modules have a `tests/*.tftest.hcl` with ≥1 meaningful, non-trivial assertion each.
- PAY-059 has a dedicated regression `run` block that fails against the pre-fix code.
- `terraform test` passes offline with `mock_provider`, no AWS credentials.
- README documents how to run, what to assert on, and the "local-only for now" decision.
