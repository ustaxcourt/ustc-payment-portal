# PAY-284: Dev `client-permissions` secret rename runbook

Migrate the dev `client-permissions` secret value's field name from `allowedFeeIds` to `allowedFeeKeys`. Code changes in PAY-284 are already shim-tolerant (see [src/clients/permissionsClient.ts:84-89](../src/clients/permissionsClient.ts#L84-L89)) — this runbook only updates the secret value, not application code.

**Risk**: low — the shim accepts both shapes, so a botched rename still works at runtime via the old field. The real failure modes are (a) a typo in the JSON that breaks structural validation, or (b) accidentally writing some unrelated value over the whole secret. Both are caught by the dry-run and diff steps.

---

## Prerequisites (one-time, before starting)

| # | Check | How |
|---|---|---|
| 1 | PAY-284 has merged or been deployed to dev | `git log origin/main --oneline -20 \| grep PAY-284`, and verify the dev Lambda's image is on a SHA that contains the shim |
| 2 | You have AWS credentials with `secretsmanager:GetSecretValue` and `secretsmanager:PutSecretValue` on `ustc/pay-gov/dev/client-permissions` | `aws sts get-caller-identity` and confirm the role has the right perms (typically the dev deployer or a break-glass admin role) |
| 3 | `jq` is installed | `jq --version` |
| 4 | You know how to force-invalidate the Lambda's in-memory cache | See "Step 7 — Force cache invalidation" below |
| 5 | You have the dev integration tests handy and they currently pass | `BASE_URL=https://dev-payments.ustaxcourt.gov npm run test:integration:dev` — confirm green before starting |

If any of these aren't true, **stop** and resolve before proceeding.

---

## Pre-flight (5 min)

### 1. Capture the current secret value to a temp file

```bash
mkdir -p ~/secrets-tmp
chmod 700 ~/secrets-tmp

aws secretsmanager get-secret-value \
  --secret-id ustc/pay-gov/dev/client-permissions \
  --query SecretString \
  --output text > ~/secrets-tmp/dev-perms-original.json
```

**Why a file**: avoids the value appearing in shell history (`history`, `~/.zsh_history`). The `~/secrets-tmp` directory is in your home with `700` perms — nobody else on the host can read it.

### 2. Verify it parses as JSON and inspect the shape

```bash
jq '.' ~/secrets-tmp/dev-perms-original.json | head -20
jq '.[0] | keys' ~/secrets-tmp/dev-perms-original.json
```

You should see an array of `{clientName, clientRoleArn, allowedFeeIds}` objects. If the shape is unexpected (no `allowedFeeIds`, or already `allowedFeeKeys`), **stop** — either the migration has already happened, or the secret is in a state we didn't anticipate. Investigate before continuing.

### 3. Record the secret's current `VersionId`

```bash
aws secretsmanager describe-secret \
  --secret-id ustc/pay-gov/dev/client-permissions \
  --region us-east-1 \
  --query 'VersionIdsToStages' \
  --output json
```

Look for the version tagged `AWSCURRENT`. **Save this version ID** — it's your rollback target. If anything goes wrong, you can `put-secret-value --secret-string file://...` with the original to revert, or use the `AWSCURRENT`/`AWSPREVIOUS` stage labels to flip back.

---

## Migration (5 min)

### 4. Produce the new value via `jq` transform

```bash
jq 'map(. + {allowedFeeKeys: .allowedFeeIds} | del(.allowedFeeIds))' \
  ~/secrets-tmp/dev-perms-original.json > ~/secrets-tmp/dev-perms-new.json
```

This is **idempotent and deterministic** — it adds `allowedFeeKeys` populated from the existing `allowedFeeIds`, then deletes `allowedFeeIds`. Any entry that didn't have `allowedFeeIds` to begin with gets `allowedFeeKeys: null` — which is a bug, hence the diff in the next step.

### 5. Diff before writing — the most important check in this runbook

```bash
diff <(jq -S . ~/secrets-tmp/dev-perms-original.json) \
     <(jq -S . ~/secrets-tmp/dev-perms-new.json)
```

You should see **only** field rename hunks like:

```diff
<     "allowedFeeIds": ["PETITION_FILING_FEE"],
---
>     "allowedFeeKeys": ["PETITION_FILING_FEE"],
```

Any other diff is a bug. Specifically watch for:
- New `null` values appearing → an entry didn't have `allowedFeeIds`; investigate.
- `clientRoleArn` or `clientName` values changing → `jq` filter is wrong; investigate.
- Number of array entries changing → `jq` filter is wrong; investigate.

**Abort if the diff isn't exactly the field rename.** Don't proceed to put-secret-value.

### 6. Write the new value

```bash
aws secretsmanager put-secret-value \
  --secret-id ustc/pay-gov/dev/client-permissions \
  --region us-east-1 \
  --secret-string file://$HOME/secrets-tmp/dev-perms-new.json
```

Capture the output — it returns the new `VersionId`. AWS Secrets Manager automatically tags the new version as `AWSCURRENT` and the previous version as `AWSPREVIOUS`, so rollback is built-in.

---

## Verification (15–30 min — the longest step)

### 7. Force cache invalidation in running Lambdas

The Lambda's in-memory cache has a 5-minute TTL ([permissionsClient.ts:19](../src/clients/permissionsClient.ts#L19)). Warm containers will continue serving the *old* value (which the shim normalizes correctly, so this isn't a functional bug — but you want to verify the new value is being read).

Two ways:

**A. Wait 5+ minutes**, then continue. Simplest, no AWS action needed. The shim makes this safe.

**B. Force replacement of warm containers** by bumping a non-functional env var on each affected Lambda:

```bash
# Repeat for each Lambda function: initPayment, processPayment, getDetails
aws lambda update-function-configuration \
  --function-name ustc-payment-processor-dev-initPayment \
  --environment "Variables={...keep existing vars..., RENAME_INVALIDATION=$(date +%s)}"
```

This is faster (~30s per function) but requires you to fetch the existing env vars first and rewrite the whole `Variables` block. Easier via Terraform — bump a tag value and `terraform apply` if your TF state owns the env vars.

For dev specifically: option A (wait 5 min) is fine. The shim's whole purpose is to remove urgency.

### 8. Functional verification

Run the dev integration tests:

```bash
BASE_URL=https://dev-payments.ustaxcourt.gov npm run test:integration:dev
```

These exercise `/init` → `/process` end-to-end and will hit the Lambda's authz check (which reads `client.allowedFeeKeys`). If the new secret value is being parsed correctly, tests pass. If they 403 with "Client not authorized for fee", something is wrong — go to rollback.

Also do a manual sanity check on CloudWatch:

```bash
aws logs tail /aws/lambda/ustc-payment-processor-dev-initPayment --since 5m --follow
```

Look for `"Invalid client permission structure"` errors — these would indicate the new value didn't pass the structural-validation guard at [permissionsClient.ts:91-96](../src/clients/permissionsClient.ts#L91-L96).

### 9. Tag the migration as complete

Update the PAY-284 ticket (or wherever the env migration tracker lives) with:

> - [x] dev migrated YYYY-MM-DD by @yourname (old VersionId: `abc-123`, new VersionId: `def-456`)

The version IDs let the next person trace the change without re-querying AWS history.

---

## Cleanup (2 min)

### 10. Delete local copies of the secret

```bash
shred -u ~/secrets-tmp/dev-perms-original.json \
         ~/secrets-tmp/dev-perms-new.json
rmdir ~/secrets-tmp 2>/dev/null
```

The files contain real client role ARNs. Don't leave them on disk. If `shred` isn't available (macOS), use `rm -P` or just `rm` followed by emptying Trash.

---

## Rollback (if anything in steps 7–9 fails)

**Symptom**: integration tests 403 after the rename, or CloudWatch shows `Invalid client permission structure` errors.

**Diagnosis**: most likely the new JSON has a typo or missing field. The shim wouldn't be the cause — that just adds `allowedFeeKeys`; the structural-validation check below the shim is what throws.

**Action — fastest path**: revert to the previous version via stage labels.

```bash
# Get the previous version ID
aws secretsmanager describe-secret \
  --secret-id ustc/pay-gov/dev/client-permissions \
  --query 'VersionIdsToStages' \
  --output json

# Look for the entry with stage "AWSPREVIOUS" — that's the version from before your put.

# Flip stage labels (atomic, no get/put needed)
aws secretsmanager update-secret-version-stage \
  --secret-id ustc/pay-gov/dev/client-permissions \
  --version-stage AWSCURRENT \
  --move-to-version-id <PREVIOUS-version-id> \
  --remove-from-version-id <NEW-version-id>
```

Force cache invalidation again (step 7), re-run integration tests. Should be back to green within 5 minutes.

**Action — backup path**: if stage-flip doesn't work, write the original file back:

```bash
aws secretsmanager put-secret-value \
  --secret-id ustc/pay-gov/dev/client-permissions \
  --secret-string file://$HOME/secrets-tmp/dev-perms-original.json
```

This writes a new version with the original content. Slower (creates a third version), but works.

---

## What this runbook does NOT cover

- **Stg / prod migrations** — same pattern, separate execution. Run dev to completion (including 24h soak) before starting stg. Run stg the same way before prod. Don't batch them.
- **CI seeder update** ([`.github/workflows/cicd-dev.yml:295`](../.github/workflows/cicd-dev.yml#L295)) — the PR-env seeder now writes `allowedFeeKeys`. No separate CI seeder change is required as part of this runbook.
- **Shim removal** — only after dev, stg, prod, AND the CI seeder are all on the new shape, AND a bake-in period has passed. Tracked in a separate follow-up ticket. **Don't** combine shim removal with this runbook.

---

## Time budget summary

| Step | Active | Wait | Notes |
|---|---|---|---|
| Prereqs verification | 10 min | — | Skip if you've done it recently |
| Pre-flight (1–3) | 5 min | — | Backup + inspect |
| Migration (4–6) | 5 min | — | `jq` transform + `put-secret-value` |
| Verification (7–9) | 10 min | 5–30 min | Wait for cache TTL OR force replacement; then integration tests |
| Cleanup (10) | 2 min | — | Shred local files |
| Tracker update | 2 min | — | |
| **Total active** | **~35 min** | | |
| **Total elapsed** | | **~45–75 min** | Mostly the cache TTL wait + test runtime |
| **Rollback budget** | **+15 min** | | If something fails verification |

Plan for **1.5 hours** of focused time end-to-end. Most of that is verification, which is non-negotiable — the shim makes the failure mode soft, but you still want to confirm the new shape is being consumed correctly before walking away.

get A pr for this branch to examine what values are populated in the secret
