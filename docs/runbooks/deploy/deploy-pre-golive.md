# Runbook: Deploying to Staging and Production (BEFORE go-live)

**Status: pre-go-live.** This procedure applies while the app has **no production
users**. No client application is relying on it yet, so we deploy freely to
practice the flow and shake out problems. After go-live, follow
[`deploy-post-golive.md`](deploy-post-golive.md) instead — same pipeline, stricter
gates.

**Retire this doc after go-live.** Once we're live this procedure is superseded by
[`deploy-post-golive.md`](deploy-post-golive.md); delete this file and drop it from
the [runbooks index](../README.md) at that point.

> One-line model: **we build the artifact once in Dev and promote that exact
> commit (by Git SHA) forward to Staging and then Production. Staging and
> Production never rebuild.**

---

## The promotion chain

```text
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
        ├─ mint + push a release-candidate (RC) tag  v<X.Y.Z>-rc.<N>  on SAME SHA
        ├─ terraform plan/apply → STAGING account
        ├─ run DB migrations (migrationRunner Lambda)
        ├─ smoke test  /init  + Pay.gov redirect
        └─ dispatch rc-release.yml → creates a GitHub Release for the RC tag
        │
        ▼
  MANUAL verification on STAGING (integration suite + getDetails/logs)
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
- You have permission to run workflows (and to approve the `staging` /
  `production` GitHub Environments once required reviewers are configured — none
  are today).

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
   (`v<X.Y.Z>-rc.<N>`) on the resolved SHA, and dispatches `rc-release.yml`,
   which creates a GitHub Release for the RC tag recording the SHA + artifact
   prefix. This Release is a normal release, not a pre-release — see the Stage 4
   known gaps for why it does not trigger a Prod deploy, and how to harden that.
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

1. Process a real transaction end-to-end against Staging by running the
   integration suite — it is SigV4-signed against a deployed API Gateway. Point it
   at the Staging API with allowed Staging credentials:
   `BASE_URL=<staging-api-gateway-url> npm run test:integration`
   (see [`src/test/integration/`](../../../src/test/integration/), e.g.
   `transaction.test.ts`). This is your primary signal — it drives a real payment
   start to finish. *(There is no Cypress suite in this repo; a client app such as
   DAWSON may exercise the flow with Cypress, but the repo-local end-to-end check
   is this Jest integration suite.)*
2. Confirm the resulting transaction reached the expected state
   (`transactionStatus` = `processed`, `paymentStatus` = `success`). **Note: the
   transaction dashboard is Dev-only** — its endpoints are gated to `dev`/`pr-*`
   in `terraform/modules/api-gateway/main.tf`, so there is **no dashboard in
   Staging.** Verify instead by one of:
   - calling the **`getDetails`** endpoint for the transaction id (it is deployed
     to Staging as a core payment Lambda), or
   - checking the `processPayment` Lambda's **CloudWatch logs** /
     [observability](../../observability/).

> **GATE — human go/no-go.** The integration suite passes **and** the transaction
> is confirmed in the expected state via `getDetails`/logs. If either fails, stop
> and fix forward; the same SHA will flow again from Stage 1.

### Verifying with `getDetails`

`getDetails` is `GET /details/{transactionReferenceId}`, where
`transactionReferenceId` is the **UUIDv4 the client generated and sent to
`/init`** (not a Pay.gov id) — your test run controls this value, so capture
it. The route is `AWS_IAM` (SigV4-signed) and `authorizeClient`-gated, so you
must call it with AWS credentials for an account the Staging API allows (the
deploying/CI account is always allowed; client accounts come from
`allowed_account_ids`). Sign it exactly like the staging smoke test signs
`/init`:

```bash
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

What to assert. The mapping is deterministic — `paymentStatus` is derived purely
from `transactionStatus` ([derivePaymentStatus.ts](../../../src/utils/derivePaymentStatus.ts)),
and Pay.gov states map via
[parseTransactionStatus.ts](../../../src/useCases/parseTransactionStatus.ts):

- Rule: any transaction `processed` → `paymentStatus` `success`; all `failed` →
  `failed`; otherwise `pending`. The two fields **never disagree** —
  `transactionStatus` = `processed` always implies `paymentStatus` = `success`.
- **Card / instant payment:** the latest transaction lands
  `transactionStatus` = `processed` / `paymentStatus` = `success` right away.
  That is your green deploy-health signal.
- **ACH:** settlement is asynchronous. Pay.gov first returns
  `Pending`/`Received`/`Submitted`/`Waiting`, which map to a **non-terminal**
  `transactionStatus` and `paymentStatus` = `pending` — for **both** fields. This
  is healthy, not a failure; you will *not* see `processed` yet. Confirm the row
  was created and Pay.gov accepted it, then re-poll `getDetails` later — it flips
  to `processed`/`success` once Pay.gov reports `Settled`/`Success`. **For deploy
  verification, prefer a card payment so you get a terminal result immediately.**

The integration tests in [`src/test/integration/`](../../../src/test/integration/)
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

- **Prod does not auto-run DB migrations** in the deploy workflow the way
  Staging does. If your change includes a migration, coordinate how it gets
  applied to the Prod database **before** promoting.
- **The RC Release is not marked as a pre-release**, so the only thing keeping it
  from triggering a Prod deploy is GitHub's "no workflow re-trigger from
  `GITHUB_TOKEN`" rule. *Verified empirically:* 14+ RC releases exist and
  `prod-deploy.yml` has never fired on a `-rc.*` tag (only one `release`-event run
  ever, on a final tag). But the safeguard is implicit — if anyone re-publishes an
  RC Release by hand (or automation switches to a PAT), `prod-deploy.yml` would
  fire and, because the release is not a pre-release, could apply. Hardening
  (mark RC releases `prerelease: true` **and** filter the Prod `release` trigger
  to skip `*-rc.*`) is tracked in the [deploy backlog](../../deploy-backlog.md).

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
| Verify | — | manual | Staging | integration suite + `getDetails`/logs |
| Prod | `prod-deploy.yml` | Release published / manual | Production | reviewed Terraform plan |

---

## Command reference

Copy-paste helpers, grouped by stage. **Read-only commands are safe to run.**
Commands that tag, release, dispatch a deploy, or apply Terraform change an
environment — run those deliberately, and per repo safety rules let a human own
every Prod action. Replace `<SHA>` / `<tag>` / `<fn>` placeholders.
`gh`/`aws` calls assume you're authenticated for the relevant account.

### Stage 1 — confirm Dev (read-only)

```bash
git tag -l "v*-dev.*" --sort=-creatordate | head
git rev-list -n 1 <tag>

aws s3 ls "s3://ustc-payment-portal-build-artifacts/artifacts/dev/<SHA>/"
for f in initPayment processPayment getDetails testCert migrationRunner; do
  aws s3api head-object \
    --bucket ustc-payment-portal-build-artifacts \
    --key "artifacts/dev/<SHA>/$f.zip" >/dev/null && echo "ok: $f" || echo "MISSING: $f"
done

gh run list --workflow=cicd-dev.yml --limit 5
```

### Stage 2 — deploy to Staging

Trigger staging (blank `source_dev_tag` auto-picks the latest valid dev tag, or
name one), then watch the run:

```bash
gh workflow run staging-deploy.yml
gh workflow run staging-deploy.yml -f source_dev_tag=<vX.Y.Z-dev.N>

gh run list --workflow=staging-deploy.yml --limit 5
gh run watch <run-id>
```

### Stage 3 — verify Staging (read-only)

Read Terraform outputs, confirm a transaction (SigV4-signed — needs Staging
creds), then tail logs:

```bash
terraform -chdir=terraform/environments/stg output -raw api_gateway_url
terraform -chdir=terraform/environments/stg output -raw migration_runner_function_name

curl -s "$API_URL/details/$TRANSACTION_REFERENCE_ID" \
  --aws-sigv4 "aws:amz:us-east-1:execute-api" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" \
  -H "x-amz-security-token: $AWS_SESSION_TOKEN" | jq

aws logs describe-log-groups \
  --log-group-name-prefix /aws/lambda/ --query 'logGroups[].logGroupName' --output text \
  | tr '\t' '\n' | grep -i processpayment
aws logs tail "/aws/lambda/<fn>" --since 15m --follow
```

### Stage 4 — promote to Production

Preview the prod plan without applying (safe to run):

```bash
gh workflow run prod-deploy.yml -f release_tag=<vX.Y.Z> -f plan_only=true
gh run watch <run-id>
```

To apply, a human publishes the final (non-pre-release) Release on the same SHA —
this changes Prod, and publishing triggers `prod-deploy.yml`:

```bash
git tag -a vX.Y.Z <SHA> -m "Release vX.Y.Z"
git push origin vX.Y.Z
gh release create vX.Y.Z --title vX.Y.Z --notes "..."
```
