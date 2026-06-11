# PAY-332 — Prod account migration scripts

Helper scripts supporting the move of the Payment Portal prod environment off the
shared `ustc-aws-isd-prod` account onto the dedicated
`ent-apps-payment-portal-workloads-prod` account.

## Convention: no hardcoded accounts

Every script takes the **target account as an argument** — there are no hardcoded
account IDs or profile names. The account argument accepts either form:

- a **12-digit account ID** → used as a *guard* (you must already be authenticated
  to it; the script refuses if your active credentials don't match), or
- an **AWS profile name** → selected via `AWS_PROFILE` for you.

So you always state which account a script runs against, and it can't silently run
somewhere unexpected.

> ⚠️ **The old account is shared** — it also holds `hello-jims-dev`,
> `amplify-nonattorneydocs-*`, and an AWS Config StackSet owned by other teams. The
> teardown only ever touches the one stack name you pass it.

## Scripts

| Script | Purpose | Mutates? |
| --- | --- | --- |
| `lib/assume.sh` | Shared logging + account-resolution (`require_account`) helpers, sourced by the others | No |
| `verify-dedicated-prod.sh` | Confirm an account is functional prod — mTLS secrets populated, API resolves; `SMOKE=1` adds a live `/init` test | No (AWS); `SMOKE=1` writes a prod txn row |
| `export-isd-logs.sh` | Pull every matching log group to a dated local folder (JSON + readable + manifest) for the SharePoint backup (AC #2) | No (AWS); writes local files |
| `teardown-stack.sh` | Delete one CloudFormation stack — account-guarded, dry-run by default, `CONFIRM=yes` to delete | Yes (the named stack) |

## Usage

```bash
# Verify the dedicated account is functional prod (read-only)
aws sso login --profile ent-apps-payment-portal-workloads-prod
./scripts/migration/verify-dedicated-prod.sh ent-apps-payment-portal-workloads-prod
SMOKE=1 ./scripts/migration/verify-dedicated-prod.sh ent-apps-payment-portal-workloads-prod   # also POST /init

# Export an account's CloudWatch logs for the SharePoint backup (AC #2)
aws sso login --profile ustc-aws-isd-prod
./scripts/migration/export-isd-logs.sh ustc-aws-isd-prod
#   optional 2nd arg = log-group prefix (default /aws/lambda/ustc-payment-processor)

# Tear down one stack — DRY RUN first, then CONFIRM=yes
./scripts/migration/teardown-stack.sh ustc-aws-isd-prod ustc-payment-processor-prod
CONFIRM=yes ./scripts/migration/teardown-stack.sh ustc-aws-isd-prod ustc-payment-processor-prod
```

Common env overrides: `AWS_REGION` (all), `SECRET_PREFIX`/`API_NAME`/`STAGE`
(verify), `LOG_PREFIX`/`OUT_DIR` (export).

## `teardown-stack.sh` safety

- **Dry run by default** — prints the stack's resources, the S3 buckets it will
  empty, and the *other* stacks it will NOT touch. Real deletion needs `CONFIRM=yes`.
- **Account guard** — refuses unless your credentials resolve to the account you named.
- **Exact stack only** — no wildcards; only the stack name you pass.
- **Empties S3 buckets first** (CFN can't delete a non-empty bucket).
- **Handles `DELETE_FAILED`** on already-gone resources (e.g. a transferred EIP) by
  retrying with `--retain-resources`, so the rest of the stack still deletes.

## Status — migration complete

- ✅ isd-prod CloudWatch logs exported and uploaded to SharePoint (AC #2)
- ✅ DNS delegated; domain resolves with a valid cert and responds (AC #6)
- ✅ EIP migrated & preserved — original prod IP transferred to the dedicated account (AC #4)
- ✅ Dedicated account stood up + Terraform drift reconciled → `terraform plan` is **clean**, so CI can deploy (AC #3, AC #5)
- ✅ Old `ustc-payment-processor-prod` stack torn down from the shared account via `teardown-stack.sh` (AC #1)
