# DB Migration Rollback Runbook

Reverts the **last batch** of migrations (= the most recent deploy that applied migrations)
in a chosen environment, by invoking the `migrationRunner` Lambda's `rollback` command.

> **Break-glass tool.** Prefer **fix-forward** (a new corrective migration) for most cases —
> rollback runs rarely-exercised `down()` code and **can lose data** (a dropped column/table
> is gone). Use rollback to undo a just-shipped bad migration before real writes depend on it.

## How to trigger

### Option 1 — GitHub Actions (preferred)

1. **Actions → "DB Migration Rollback (manual)" → Run workflow**.
2. Select the **environment** (`dev`, `stg`, `prod`).
3. In **confirm**, type the environment name exactly (e.g. `prod`).
4. Run. **Prod pauses for a required reviewer** before proceeding.

The run is the audit record (who/what/when) and fails if the Lambda reports an error.

### Option 2 — Direct invoke (only if Actions is unavailable)

Requires the environment's deployer credentials:

```bash
aws lambda invoke \
  --function-name "<env>-migrationRunner" \
  --payload '{"command":"rollback","confirm":true}' \
  --cli-binary-format raw-in-base64-out \
  --log-type Tail --cli-read-timeout 130 \
  response.json
cat response.json
```

Function names: `ustc-payment-processor-migrationRunner` (dev),
`ustc-payment-portal-stg-migrationRunner` (stg), `ustc-payment-portal-prod-migrationRunner` (prod).
`confirm:true` is mandatory — the Lambda refuses without it.

## Result

Returns `{ batchNo, migrations }` — the batch rolled back and the files reverted. An empty
`migrations` list means there was nothing to roll back.

## If rollback can't recover it

If a migration destroyed data, the only true undo is an **RDS point-in-time restore** to
before the deploy — an operational event that loses all writes since that point. Last resort.

## One-time setup

- Configure **required reviewers** on the `prod` GitHub Environment (enables the prod gate).
- Deployer role already has `lambda:InvokeFunction` on `*-migrationRunner` (from PAY-355) — no new IAM.
