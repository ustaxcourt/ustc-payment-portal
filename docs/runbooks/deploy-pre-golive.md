# Runbook: Deploying to Staging and Production (BEFORE go-live)

**Status: pre-go-live.** This procedure applies while the app has **no production
users**. No client application is relying on it yet, so we deploy freely to
practice the flow and shake out problems. After go-live, follow
[`deploy-post-golive.md`](deploy-post-golive.md) instead — same pipeline, stricter
gates.

> One-line model: **we build the artifact once in Dev and promote that exact
> commit (by Git SHA) forward to Staging and then Production. Staging and
> Production never rebuild.**

---

## The promotion chain

```
  merge PR to main
        │
        ▼
  [cicd-dev.yml]  AUTOMATIC on push to main
        ├─ build + deploy to DEV
        ├─ run integration tests against DEV
        ├─ upload 5 artifacts → s3://ustc-payment-portal-build-artifacts/artifacts/dev/<SHA>/
        └─ auto-tag  v<X.Y.Z>-dev.<N>  on the deployed SHA
        │
        ▼
  [staging-deploy.yml]  MANUAL (workflow_dispatch)
        ├─ pick a dev tag (latest valid, or one you name)
        ├─ validate all 5 artifact zips exist for that SHA
        ├─ mint + push an RC tag  v<X.Y.Z>-rc.<N>  on the SAME SHA
        ├─ terraform plan/apply → STAGING account
        ├─ run DB migrations (migrationRunner Lambda)
        ├─ smoke test  /init  + Pay.gov redirect
        └─ dispatch rc-release.yml → creates a GitHub *pre-release*
        │
        ▼
  MANUAL verification on STAGING (Cypress + getDetails/logs)
        │
        ▼
  cut final tag  v<X.Y.Z>  on the SAME SHA + publish a (non-pre-) GitHub Release
        │
        ▼
  [prod-deploy.yml]  on Release published
        ├─ re-validate artifacts for the SAME SHA
        ├─ terraform plan  (apply gated)
        └─ terraform apply → PRODUCTION account
```

The unit of promotion is the **commit SHA**, not a re-build. Every stage
re-validates that the Dev-built zips still exist for that SHA before it does
anything. If you remember one thing, remember that.

---

## Prerequisites

- Your change is merged to `main` and the `cicd-dev.yml` run for that merge is
  **green**. A red Dev run means there is nothing safe to promote — stop.
- You can see the auto-created `v<X.Y.Z>-dev.<N>` tag for your commit
  (`git tag -l "v*-dev.*" --sort=-creatordate | head`).
- You have permission to run workflows and to approve the `staging` /
  `production` GitHub Environments.

---

## Stage 1 — Confirm Dev is good (no action, just verify)

Dev deploys automatically when the PR merges. Do **not** skip the check.

1. Open the `CICD - Dev` run for your merge commit. Confirm the `deploy_dev` job
   succeeded, including its integration tests against Dev.
2. Confirm the artifacts exist:
   `s3://ustc-payment-portal-build-artifacts/artifacts/dev/<SHA>/` should contain
   `initPayment.zip`, `processPayment.zip`, `getDetails.zip`, `testCert.zip`,
   `migrationRunner.zip`.

> **GATE:** Dev run green + 5 artifacts present. If not, fix forward on `main`;
> do not promote.

---

## Stage 2 — Deploy to Staging

1. Run the **`CICD - Staging`** workflow (`staging-deploy.yml`) via
   *Run workflow* / `workflow_dispatch`.
   - Leave **`source_dev_tag`** blank to auto-select the newest dev tag that has
     artifacts, **or** type a specific `v<X.Y.Z>-dev.<N>` to promote a known
     commit.
2. The `promote` job validates artifacts, mints an **RC tag**
   (`v<X.Y.Z>-rc.<N>`) on the resolved SHA, and dispatches `rc-release.yml`
   (which opens a GitHub **pre-release** recording the SHA + artifact prefix).
3. The `deploy` job runs against the Staging account: `terraform apply`, then DB
   migrations via the `migrationRunner` Lambda, then the built-in smoke test.

> **GATE — automated smoke test must pass.** The pipeline POSTs to `/init` and
> expects: HTTP `200`, a `token` and `paymentRedirect` in the response, and the
> Pay.gov redirect URL returning `302`. A red smoke test means Staging is not
> wired up correctly — **do not promote to Prod.**

---

## Stage 3 — Verify Staging by hand

The pipeline only proves `/init` works. You must prove a **full transaction**
works end-to-end.

1. Run the Cypress "process a transaction" flow against the Staging URL. This is
   your primary signal — it drives a real payment from start to finish.
2. Confirm the resulting transaction reached the expected state
   (`transactionStatus` = `processed`, `paymentStatus` = `success`). **Note: the
   transaction dashboard is Dev-only** — its endpoints are gated to `dev`/`pr-*`
   in `terraform/modules/api-gateway/main.tf`, so there is **no dashboard in
   Staging.** Verify instead by one of:
   - calling the **`getDetails`** endpoint for the transaction id (it is deployed
     to Staging as a core payment Lambda), or
   - checking the `processPayment` Lambda's **CloudWatch logs** /
     [observability](../observability/).

> **GATE — human go/no-go.** Cypress green **and** the transaction confirmed in
> the expected state via `getDetails`/logs. If either fails, stop and fix
> forward; the same SHA will flow again from Stage 1.

### Verifying with `getDetails`

`getDetails` is `GET /details/{transactionReferenceId}`, where
`transactionReferenceId` is the **UUIDv4 the client generated and sent to
`/init`** (not a Pay.gov id) — your Cypress run controls this value, so capture
it. The route is `AWS_IAM` (SigV4-signed) and `authorizeClient`-gated, so you
must call it with AWS credentials for an account the Staging API allows (the
deploying/CI account is always allowed; client accounts come from
`allowed_account_ids`). Sign it exactly like the staging smoke test signs
`/init`:

```bash
# API_URL from terraform output (see Command reference); creds = assumed Staging role
curl -s "$API_URL/details/$TRANSACTION_REFERENCE_ID" \
  --aws-sigv4 "aws:amz:us-east-1:execute-api" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" \
  -H "x-amz-security-token: $AWS_SESSION_TOKEN" | jq
```

Response shape:

```jsonc
{
  "paymentStatus": "success",          // business outcome: pending | success | failed
  "transactions": [                    // one entry PER ATTEMPT — may be more than one
    {
      "payGovTrackingId": "...",
      "transactionStatus": "processed", // technical: received|initiated|processed|failed
      "returnDetail": "...",
      "createdTimestamp": "...",
      "updatedTimestamp": "..."
    }
  ]
}
```

What to assert:

- The **latest** transaction row has `transactionStatus` = `processed`. This is
  your "a payment ran end-to-end and persisted" signal. When there are multiple
  attempts, the latest one is what counts.
- `paymentStatus` = `success` for an instant/card payment. **ACH settles
  asynchronously**, so `paymentStatus` may legitimately remain `pending` even on
  a good attempt — in that case rely on the latest `transactionStatus` =
  `processed` as the deploy-health signal.

The integration tests in [`src/test/integration/`](../../src/test/integration/)
are the canonical example of a signed `getDetails` client if you need the exact
signing in code.

---

## Stage 4 — Promote to Production

Production deploys from a **final (non-pre-release) GitHub Release** on the
**same commit SHA** that passed Staging.

1. Create the final tag `v<X.Y.Z>` on that SHA (drop the `-rc.<N>` suffix) and
   publish a GitHub Release for it. Publishing triggers `prod-deploy.yml`.
   - **Plan-first option:** instead of a Release, dispatch `prod-deploy.yml`
     manually with `plan_only=true` (the default) to see the Terraform plan
     without applying. Review it, then publish the Release (or re-dispatch with
     `plan_only=false`) to apply.
2. `prod-deploy.yml` re-validates the artifacts for the SHA, runs
   `terraform plan`, and applies **only** when it's a real (non-pre-release)
   Release *or* `plan_only=false`, *and* the plan actually has changes.

> **GATE — review the Terraform plan before applying.** Prod is a **separate AWS
> account**. Per repo safety rules, a human owns the apply decision — read the
> plan, confirm it only changes the lambda artifact keys you expect, then let it
> apply.

### Known gaps to be aware of at this stage (pre-go-live)

- **Prod has no post-deploy smoke test today** — the smoke-test step in
  `prod-deploy.yml` is commented out. After a Prod apply, manually confirm the
  API responds. (No ticket exists yet — filing one is a deliverable of this
  spike; see Section 3 / the PO ticket list.)
- **Prod does not auto-run DB migrations** in the deploy workflow the way
  Staging does. If your change includes a migration, coordinate how it gets
  applied to the Prod database **before** promoting.

---

## If a gate fails

Stop promoting and fix forward — re-run from Stage 1 with the corrected commit.
For reverting a deploy that already reached an environment, see the **rollback
strategy** in [`deploy-rollback.md`](deploy-rollback.md). The short version:
because every environment is pinned to an artifact by SHA, redeploying the
previous green tag is a clean code rollback — but a **database migration is not
undone by redeploying old code**, so never ship a destructive migration in the
same release as the code that depends on it.

---

## Quick reference

| Stage | Workflow | Trigger | Target account | Hard gate |
|-------|----------|---------|----------------|-----------|
| Dev | `cicd-dev.yml` | auto on push to `main` | Dev | run green + 5 artifacts |
| Staging | `staging-deploy.yml` | manual dispatch | Staging | `/init` smoke test 200 + redirect 302 |
| Verify | — | manual | Staging | Cypress + `getDetails`/logs |
| Prod | `prod-deploy.yml` | Release published / manual | Production | reviewed Terraform plan |

---

## Command reference

Copy-paste helpers, grouped by stage. **Read-only commands are safe to run.**
Anything that tags, releases, dispatches a deploy, or applies Terraform changes
an environment — run those deliberately, and per repo safety rules let a human
own every Prod action. Replace `<SHA>` / `<tag>` / `<fn>` placeholders.
`gh`/`aws` calls assume you're authenticated for the relevant account.

### Stage 1 — confirm Dev (read-only)

```bash
# Newest dev tags, most recent first
git tag -l "v*-dev.*" --sort=-creatordate | head

# Resolve a tag to its commit SHA
git rev-list -n 1 <tag>

# Confirm all 5 artifacts exist for the SHA
aws s3 ls "s3://ustc-payment-portal-build-artifacts/artifacts/dev/<SHA>/"
# Per-file check (exits non-zero if missing):
for f in initPayment processPayment getDetails testCert migrationRunner; do
  aws s3api head-object \
    --bucket ustc-payment-portal-build-artifacts \
    --key "artifacts/dev/<SHA>/$f.zip" >/dev/null && echo "ok: $f" || echo "MISSING: $f"
done

# Watch the Dev run for your merge
gh run list --workflow=cicd-dev.yml --limit 5
```

### Stage 2 — deploy to Staging

```bash
# Trigger staging (blank source_dev_tag = auto-pick latest valid dev tag)
gh workflow run staging-deploy.yml
#   …or promote a specific dev tag:
gh workflow run staging-deploy.yml -f source_dev_tag=<v X.Y.Z-dev.N>

# Watch it
gh run list --workflow=staging-deploy.yml --limit 5
gh run watch <run-id>
```

### Stage 3 — verify Staging (read-only)

```bash
# Get the Staging API URL + migration runner name from Terraform outputs
terraform -chdir=terraform/environments/stg output -raw api_gateway_url
terraform -chdir=terraform/environments/stg output -raw migration_runner_function_name

# Confirm a transaction end-to-end (SigV4-signed; needs allowed Staging creds)
curl -s "$API_URL/details/$TRANSACTION_REFERENCE_ID" \
  --aws-sigv4 "aws:amz:us-east-1:execute-api" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" \
  -H "x-amz-security-token: $AWS_SESSION_TOKEN" | jq

# Tail processPayment logs (find the exact log group first)
aws logs describe-log-groups \
  --log-group-name-prefix /aws/lambda/ --query 'logGroups[].logGroupName' --output text \
  | tr '\t' '\n' | grep -i processpayment
aws logs tail "/aws/lambda/<fn>" --since 15m --follow
```

### Stage 4 — promote to Production

```bash
# Plan-only first: see the prod Terraform plan WITHOUT applying
gh workflow run prod-deploy.yml -f release_tag=<vX.Y.Z> -f plan_only=true
gh run watch <run-id>          # read the plan in the job log

# To apply, publish the final (non-pre-release) GitHub Release on the SAME SHA.
# Creating tags/releases changes Prod — provide to the developer to run; do not
# script around the human gate:
#   git tag -a vX.Y.Z <SHA> -m "Release vX.Y.Z"   # run by a human
#   git push origin vX.Y.Z                          # run by a human
#   gh release create vX.Y.Z --title vX.Y.Z --notes "…"   # triggers prod-deploy.yml
```
