# PAY-264: GitHub Workflow for Terraform Validate and Plan

## Overview

Add a new GitHub Actions workflow `.github/workflows/terraform-plan.yml` that runs on every pull request and produces a `terraform validate` + `terraform plan` against **dev**, **stg**, and **prod**. The output gives reviewers visibility into what infrastructure changes would land in each environment when the PR is merged — without applying anything.

This is a **read-only safety net**, not a deployment workflow. Apply remains gated by the existing `cicd-dev.yml` (dev, on PR), `staging-deploy.yml` (manual), and `prod-deploy.yml` (release-triggered).

---

## Context — what already exists

| File | Purpose | What it does for TF | What it does NOT do |
|---|---|---|---|
| [.github/workflows/cicd-dev.yml](.github/workflows/cicd-dev.yml) | PR ephemeral env + deploy_dev | `init` → `plan` → `apply` against `terraform/environments/dev` in PR workspace | Touch stg or prod |
| [.github/workflows/staging-deploy.yml](.github/workflows/staging-deploy.yml) | Manual stg deploy | `init` → `plan` → `apply` against `terraform/environments/stg` | Run on PR |
| [.github/workflows/prod-deploy.yml](.github/workflows/prod-deploy.yml) | Release-triggered prod deploy | `init` → `plan` → `apply` against `terraform/environments/prod` | Run on PR |

So we already have all three plan flows working in production — this ticket is about **lifting them out of the deploy workflows and running all three on every PR for visibility**.

### Existing OIDC roles (reusable)

Each environment has a deployer role with a trust policy that accepts any ref in the repo (`repo:ustaxcourt/ustc-payment-portal:*` — see [terraform/modules/iam/locals.tf:3](terraform/modules/iam/locals.tf#L3)). That means **no IAM/Terraform changes are needed** for this workflow to assume the existing roles:

- `secrets.DEV_AWS_DEPLOYER_ROLE_ARN` → `ustc-payment-processor-dev-cicd-deployer-role`
- `secrets.STAGING_AWS_DEPLOYER_ROLE_ARN` → `ustc-payment-processor-stg-cicd-deployer-role`
- `secrets.PROD_AWS_DEPLOYER_ROLE_ARN` → `ustc-payment-processor-prod-cicd-deployer-role`

### Backend state

All three envs use S3 + S3 native locking (`use_lockfile = true`). Even a plan acquires the lock briefly. Conflict surface: a PR plan could collide with a concurrent stg/prod apply. Mitigation: configurable concurrency group (see Design).

### Lambda artifact TF_VARs are the awkward bit

All three env `variables.tf` files declare ~14 `TF_VAR_*_s3_key` / `*_source_code_hash` variables for the seven Lambda functions. In deploy workflows, these are populated from artifact upload step outputs. **In a plan-only workflow, we have two options**:

1. Rely on the `default = ""` values in dev (`dev/variables.tf` has defaults; stg/prod do not — see diff below).
2. Pass placeholder values that match what's currently deployed (read from the state's outputs or set to `placeholder`).

Without artifact paths, the plan output for each env will show diffs for every Lambda function (current artifact key vs `""`). That's noise reviewers must learn to ignore — but it's a known limitation, not a bug.

**Recommended approach**: pass a stable placeholder (`"plan-only-no-artifact"`) for all artifact vars. Document the noise in the PR comment template so reviewers ignore Lambda diffs. Real Lambda changes are caught by the existing deploy workflows.

---

## Design

### Workflow file: `.github/workflows/terraform-plan.yml`

**Trigger**: `pull_request: [opened, synchronize, reopened]` — re-runs on every push to the PR branch. Do **not** trigger on `closed` (no point planning a closed PR).

**Concurrency**: group by `${{ github.workflow }}-${{ github.event.pull_request.number }}` with `cancel-in-progress: true`. Each PR has only one plan in flight at a time; new pushes cancel stale ones.

**Permissions**:
```yaml
permissions:
  id-token: write       # OIDC
  contents: read        # checkout
  pull-requests: write  # PR comment
```

**Strategy**: matrix of three environments. Each matrix leg runs the same template — auth → init → validate → plan → save output → comment on PR.

```yaml
strategy:
  fail-fast: false                # surface all three env results even if one fails
  matrix:
    include:
      - env: dev
        role_arn_secret: DEV_AWS_DEPLOYER_ROLE_ARN
        backend_config: backend.hcl
      - env: stg
        role_arn_secret: STAGING_AWS_DEPLOYER_ROLE_ARN
        backend_config: backend.hcl
      - env: prod
        role_arn_secret: PROD_AWS_DEPLOYER_ROLE_ARN
        backend_config: backend.hcl
```

Note: **dev uses `backend.hcl`**, not `backend-pr.hcl`. This workflow plans against the *real* dev state (not a PR workspace) so reviewers see what would land in actual dev on merge, matching what `cicd-dev.yml` does in its `deploy_dev` job. PR ephemeral workspaces are owned by `cicd-dev.yml`.

### Step-by-step (per matrix env)

1. **Checkout** at PR head SHA.
2. **Configure AWS Credentials (OIDC)** — `aws-actions/configure-aws-credentials@v4` with `role-to-assume: ${{ secrets[matrix.role_arn_secret] }}`.
3. **Setup Terraform** — `hashicorp/setup-terraform@v4` with `terraform_version: "1.14.6"` (matches existing workflows), `terraform_wrapper: false`.
4. **Terraform Init** — `terraform init -input=false -backend-config=${{ matrix.backend_config }} -reconfigure`.
5. **Terraform Validate** — `terraform validate -no-color` (fast syntactic check, runs offline).
6. **Terraform Plan** with `-detailed-exitcode` and placeholder Lambda vars:
   ```bash
   set +e
   terraform plan -input=false -lock-timeout=2m -detailed-exitcode -no-color -out=tfplan
   echo "exitcode=$?" >> $GITHUB_OUTPUT
   terraform show -no-color tfplan > tfplan.txt
   set -e
   ```
   Exit codes:
   - `0` — no changes (clean)
   - `1` — error
   - `2` — changes pending (success, but with diff)

   All three are valid outcomes to report; only `1` should fail the job.
7. **Upload plan artifact** — `actions/upload-artifact@v4` with `name: tfplan-${{ matrix.env }}` containing `tfplan.txt` (and optionally the binary `tfplan` if useful for downstream tooling). Keeps the full plan accessible from the PR's Checks tab.
8. **Truncate and post PR comment** — see below.

### PR comment format

Single comment per PR, updated in place across runs (`peter-evans/create-or-update-comment@v4` keyed on a marker line). Avoids comment-spam on rebases.

```markdown
<!-- terraform-plan-bot:PAY-264 -->
## Terraform plan for PR #N (SHA `abc1234`)

| Env | Status | Changes |
|---|---|---|
| dev | ✓ ok | 3 to add, 1 to change |
| stg | ✓ ok | no changes |
| prod | ✗ error | init failed (see Actions log) |

<details><summary>dev plan (3 add, 1 change)</summary>

```diff
... first 200 lines of tfplan.txt ...
```

[Full plan artifact](link)
</details>

> **Note**: Lambda function diffs (`*_s3_key`, `*_source_code_hash`) in this plan are artifacts of plan-only mode and do not reflect real changes. Actual Lambda changes ship via `cicd-dev.yml` / `staging-deploy.yml` / `prod-deploy.yml`.
```

Truncate per-env plan output to the first ~200 lines (or ~50KB) to fit GitHub's 65KB comment cap. Full plans live in the artifact.

### Concurrency vs running deploys

- **Dev**: A PR's plan acquires the dev state lock briefly. `deploy_dev` (on push to main) could collide. The S3 lockfile retries; `-lock-timeout=2m` gives 2 minutes of slack. In the rare collision, the plan job fails — that's acceptable; the next push retriggers it.
- **Stg / prod**: Same lock dance. Stg deploys are manual and infrequent; prod deploys are release-triggered. Collision probability is low. If it becomes a problem, add a global concurrency group across this workflow and the deploy workflows — but YAGNI for first cut.

### Failure modes & their handling

| Scenario | Outcome | What reviewers see |
|---|---|---|
| Validate fails (syntax error) | Job fails before plan | Red ✗ in matrix, error in PR comment |
| Init fails (backend unreachable) | Job fails | Red ✗ |
| Plan fails (e.g. provider auth) | Job fails | Red ✗, error message |
| Plan succeeds with 0 changes | Green ✓, "no changes" | No-op result |
| Plan succeeds with changes | Green ✓, diff in comment | Visible Lambda noise (acceptable) |
| OIDC role assumption fails | Job fails at step 2 | Red ✗ |
| Bot lacks PR-write permission (e.g. fork PR) | Plan runs, comment step soft-fails | Plan visible in Actions tab only |

### Fork PRs

By default `pull_request` events from forks do **not** get write tokens — the `pull-requests: write` permission is silently downgraded. Three options:

1. **Accept it** — fork PRs get a plan in the Actions log but no comment. Internal PRs (all of them, typically) work fully.
2. Use `pull_request_target` — runs in the base repo context with write tokens, but has a serious security caveat: it runs against the *target* branch's workflow YAML, not the PR's. Safe for THIS workflow if we never check out PR code, but we *do* (we need to plan PR-modified TF). Don't use this.
3. Use a separate `workflow_run` job — adds complexity for a small benefit.

Recommend **option 1** — accept the limitation. Document it in the README. If forks become common, revisit.

---

## File-by-File Changes

### `.github/workflows/terraform-plan.yml` *(new)*

Full new workflow per the design above. ~120 lines including matrix, env vars, comment template.

### `.github/workflows/README.md`

Add a section describing the new workflow alongside the existing ones:

```markdown
- **Terraform Validate & Plan** (`terraform-plan.yml`)
  - Trigger: Pull Request opened/synchronized/reopened.
  - Runs `terraform validate` and `terraform plan` against dev, stg, and prod (read-only).
  - Posts a unified plan summary as a PR comment; full plans uploaded as artifacts.
  - Does not apply — apply still owned by `cicd-dev.yml`, `staging-deploy.yml`, `prod-deploy.yml`.
  - **Known noise**: Lambda artifact diffs in the plan output are not real and should be ignored. See workflow header.
```

### Terraform — no changes required

- Deployer role trust policies already accept any ref in the repo.
- Existing `default = ""` Lambda vars in `dev/variables.tf` allow planning without artifacts. **However, `stg/variables.tf` and `prod/variables.tf` do NOT have defaults** — they require explicit values. We work around this by always passing placeholder `TF_VAR_*` values (see below). No TF change.

### Workflow environment block (concrete)

Pass placeholders for all artifact vars to avoid prompting / failures:

```yaml
env:
  TF_IN_AUTOMATION: "true"
  TF_INPUT: "false"
  AWS_REGION: ${{ vars.AWS_REGION }}
  # Lambda artifact placeholders — plan-only, real values come from deploy workflows.
  TF_VAR_artifact_bucket: "plan-only-no-artifact"
  TF_VAR_initPayment_s3_key: "plan-only-no-artifact"
  TF_VAR_processPayment_s3_key: "plan-only-no-artifact"
  TF_VAR_getDetails_s3_key: "plan-only-no-artifact"
  TF_VAR_testCert_s3_key: "plan-only-no-artifact"
  TF_VAR_migrationRunner_s3_key: "plan-only-no-artifact"
  TF_VAR_getAllTransactions_s3_key: "plan-only-no-artifact"
  TF_VAR_getTransactionsByStatus_s3_key: "plan-only-no-artifact"
  TF_VAR_getTransactionPaymentStatus_s3_key: "plan-only-no-artifact"
  TF_VAR_initPayment_source_code_hash: "plan-only-no-artifact"
  TF_VAR_processPayment_source_code_hash: "plan-only-no-artifact"
  TF_VAR_getDetails_source_code_hash: "plan-only-no-artifact"
  TF_VAR_testCert_source_code_hash: "plan-only-no-artifact"
  TF_VAR_migrationRunner_source_code_hash: "plan-only-no-artifact"
  TF_VAR_getAllTransactions_source_code_hash: "plan-only-no-artifact"
  TF_VAR_getTransactionsByStatus_source_code_hash: "plan-only-no-artifact"
  TF_VAR_getTransactionPaymentStatus_source_code_hash: "plan-only-no-artifact"
```

Slight DRYness concern: this list duplicates the artifact vars across this file and the three deploy workflows. Acceptable — they were already triplicated. A composite action could collapse them in a follow-up.

---

## Implementation Steps

1. **Verify OIDC trust policies actually accept any ref.** Run `aws iam get-role --role-name ustc-payment-processor-prod-cicd-deployer-role --query 'Role.AssumeRolePolicyDocument'` and confirm the `StringLike` sub matches `repo:ustaxcourt/ustc-payment-portal:*`. If any env restricts to `refs/heads/main` only, that env's trust policy needs broadening before this workflow can assume the role from a PR ref.
2. **Confirm GitHub repo secrets exist**: `DEV_AWS_DEPLOYER_ROLE_ARN`, `STAGING_AWS_DEPLOYER_ROLE_ARN`, `PROD_AWS_DEPLOYER_ROLE_ARN`. Existing workflows reference all three — should be in place.
3. **Write `terraform-plan.yml`** following the design above.
4. **Test on a throwaway PR**:
   - Open a PR that touches a non-trivial TF file (e.g. add a tag to an existing resource).
   - Verify all three matrix legs run.
   - Verify the PR comment renders correctly with table + collapsible details.
   - Verify no apply happened (check the state's last-modified timestamp before/after).
   - Verify the `-detailed-exitcode` distinguishes `2` (changes) from `0` (clean).
5. **Test the no-changes case**: open a PR that touches only application code, confirm matrix runs and comment says "no changes" for all envs.
6. **Test the failure case**: deliberately introduce a TF syntax error in one env's main.tf, confirm only that matrix leg fails and the other two still report.
7. **Update `.github/workflows/README.md`** with the new entry.
8. **Open PR**, get review, merge.

---

## Acceptance Criteria mapping

| Criterion | Implementation |
|---|---|
| Triggers on pull request | `on: pull_request: [opened, synchronize, reopened]` |
| Runs for each environment in `terraform/environments/${TARGET_ENV}` | Matrix on `[dev, stg, prod]`, `working-directory: terraform/environments/${{ matrix.env }}` |
| Uses OIDC to assume AWS deployer roles per environment | `aws-actions/configure-aws-credentials@v4` with `role-to-assume: ${{ secrets[matrix.role_arn_secret] }}`, `permissions: id-token: write` |
| Specific role secrets: `DEV_AWS_DEPLOYER_ROLE_ARN`, `STAGING_AWS_DEPLOYER_ROLE_ARN`, `PROD_AWS_DEPLOYER_ROLE_ARN` | Mapped via matrix `role_arn_secret` field |
| Initializes the terraform config | `terraform init -input=false -backend-config=backend.hcl -reconfigure` |
| Validates the config | `terraform validate -no-color` |
| Performs and outputs the plan (or notes that it could not be planned if env not deployed) | `terraform plan -detailed-exitcode -out=tfplan` + `terraform show > tfplan.txt`; if init fails (env not provisioned), the matrix leg reports "init failed" in the PR comment |

---

## Open Questions / Risks

1. **Prod state lock contention during a release**. If a release is mid-deploy and a PR pushes a commit, the PR's plan against prod will fail to acquire the lock. The `-lock-timeout=2m` gives some slack. Watch for false negatives; consider a workflow-level concurrency group across plan + deploy if it becomes painful.
2. **Plan output leaks**. `terraform plan` output can include resource ARNs, secret IDs, IP addresses, and other infrastructure details. The PR comment makes this visible to anyone with repo read access. For a public repo (this one *is* public), this is significant. **Mitigations**: review the plan template carefully before merge; consider redacting known-sensitive outputs; consider posting full plans only as artifacts (not PR comments) and just posting a summary table. Recommend stricter redaction if any AC reviewer flags this.
3. **Plan-only Lambda diff noise**. Every plan will show Lambda function diffs because we're passing placeholder artifact keys. Reviewers will learn to ignore this — but a new reviewer might assume a real change. The PR comment template footer notes this; document also in `README.md`.
4. **Cost**. Three planning runs per PR push (× many PRs) means more API calls to AWS, more `setup-terraform` cache misses, more Actions minutes. Not significant, but worth knowing.
5. **`terraform validate` doesn't catch much that init+plan won't**. Including it as a separate step is cheap and the ticket asks for it, so include it. Don't expect it to fail often.

---

## Out of Scope

- Automatically commenting plan results to the Jira ticket (PAY-264 has no such ask).
- Refactoring the duplicated `TF_VAR_*` blocks across all four workflows into a composite action — separate ticket, would touch deploy workflows we should not destabilize.
- Adding a `plan_only` knob to the existing deploy workflows — those already have plan steps; this ticket is about a *separate* always-on plan workflow.
- Restricting the deployer roles to read-only for this workflow (would require new IAM roles + trust policies — separate ticket if security review demands it).
- Posting plans to Slack / email — out of scope; PR comments are the agreed channel.
