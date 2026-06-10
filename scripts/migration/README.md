# PAY-332 — Prod account migration scripts

Read-only helper scripts supporting the move of the Payment Portal prod
environment off the shared `ustc-aws-isd-prod` account (`402985502068`) onto the
dedicated `ent-apps-payment-portal-workloads-prod` account (`802939326821`).

## Context

- The dedicated account is **stood up and serving** — `payments.ustaxcourt.gov`
  is delegated to its Route 53 zone, resolves, and presents a valid TLS cert.
- The Payment Portal has **never been live** in prod (no data, no real traffic).
- The source environment in isd-prod was deployed with the **Serverless
  Framework**, so its resources are owned by the CloudFormation stack
  `ustc-payment-processor-prod`. Eventual teardown is a stack delete — not
  `terraform destroy`.

> ⚠️ **`402985502068` is a shared account.** It also holds `hello-jims-dev`,
> `amplify-nonattorneydocs-*`, and an AWS Config StackSet owned by other teams.
> Any teardown must target **only** `ustc-payment-processor-prod`.

## Scripts

| Script | Purpose | Mutates? |
| --- | --- | --- |
| `lib/assume.sh` | Shared logging + (optional) cross-account role helpers, sourced by the others | No |
| `verify-dedicated-prod.sh` | Confirm the dedicated account is functional prod — mTLS secrets populated, API resolves; `SMOKE=1` adds a live `/init` test | No (AWS); `SMOKE=1` writes a prod txn row |
| `export-isd-logs.sh` | Pull every Payment Portal log group from isd-prod to a dated local folder (JSON + readable + manifest) for the SharePoint backup (AC #2) | No (AWS); writes local files |

### `verify-dedicated-prod.sh`

```bash
aws sso login --profile ent-apps-payment-portal-workloads-prod
./scripts/migration/verify-dedicated-prod.sh
```

Confirms you're in `802939326821`, that the Pay.gov mTLS secrets are populated
(length only — never prints values), the operational allow-lists, and that the API
Gateway resolves. `SMOKE=1` additionally POSTs a SigV4-signed `/init` (writes a
prod transaction row — opt-in). Override via `AWS_PROFILE`, `DED_ACCOUNT_ID`,
`SECRET_PREFIX`, `API_NAME`, `STAGE`.

### `export-isd-logs.sh`

```bash
aws sso login --profile ustc-aws-isd-prod
./scripts/migration/export-isd-logs.sh
# then upload the printed folder to the SharePoint backup location (AC #2)
```

Exports all log groups under `/aws/lambda/ustc-payment-processor` to
`~/isd-prod-log-backup-<UTC>/` (per group: full `*.json`, readable `*.log`, plus a
`MANIFEST.txt`). Volume is small, so a direct CLI pull is sufficient — no S3
export-task plumbing. Override via `AWS_PROFILE`, `LOG_PREFIX`, `AWS_REGION`,
`OUT_DIR`.

## Status / remaining work

- ✅ isd-prod CloudWatch logs exported and uploaded to SharePoint (AC #2)
- ✅ DNS delegated to the dedicated account; alias record added; domain resolves
- ✅ Dedicated account verified functional (Pay.gov mTLS confirmed)
- ⏳ **Reconcile Terraform drift** — the live dedicated account diverges from the
  repo's prod config (it carries leftover Serverless-named Lambdas), so
  `terraform apply`/CI can't deploy cleanly yet. Required before the "CICD deploys
  to the dedicated account" criterion is met.
- ⏳ **Teardown** the `ustc-payment-processor-prod` stack in isd-prod — after the
  above, and gated/reviewed (it deletes resources in a shared account).
