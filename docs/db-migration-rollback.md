# DB Migration Rollback Runbook

How to reverse a database schema migration in a deployed environment (`dev`, `stg`,
`prod`) when a deployment shipped a bad migration.

> **Default is fix-forward, not rollback.** For most problems the right move is to write
> a new corrective migration and deploy it through the normal forward path. Rollback is a
> **break-glass** tool — it can lose data and runs `down()` code that is rarely exercised.
> Read [When to roll back vs. fix-forward](#when-to-roll-back-vs-fix-forward) before using it.

## What rollback does

Rollback reverts the **last batch** of migrations — i.e. the most recent deploy that
actually applied migrations — by running each of those migrations' `down()` functions in
reverse order. It is implemented by the `rollback` command on the `migrationRunner` Lambda,
which calls Knex's `migrate.rollback()` for the last batch only (all-history rollback is
intentionally not available).

- **Unit of rollback = one deploy.** Every deploy runs `migrate.latest()` once, so all of
  its migrations share one batch. One rollback reverses exactly that deploy, returning the
  schema to its pre-deploy state.
- **No-op nuance:** if your most recent deploy applied **no** new migrations, the "last
  batch" belongs to an earlier deploy — a rollback would revert *that* one. Rollback always
  targets the most recent batch that changed the schema, which in the failed-deploy case is
  the deploy you just ran.
- **Returns** `{ batchNo, migrations }` — the batch that was rolled back and the list of
  migration files reverted. An empty list means there was nothing to roll back.

## How to trigger

### Option 1 — GitHub Actions (preferred)

1. Go to **Actions → "DB Migration Rollback (manual)" → Run workflow**.
2. Select the **environment** (`dev`, `stg`, or `prod`).
3. In **confirm**, type the environment name exactly (e.g. `prod`).
4. Run. For **prod**, the run pauses for a **required reviewer** to approve before it proceeds.

The workflow assumes the environment's deployer role via OIDC (no local credentials),
resolves the `migrationRunner` function via `terraform output`, invokes the `rollback`
command, and fails the run if the Lambda reports a `FunctionError`. The run is the audit
record of who rolled back what, and when.

### Option 2 — Direct invoke (break-glass)

If Actions is unavailable, and you hold the environment's deployer credentials:

```bash
aws lambda invoke \
  --function-name "$(terraform -chdir=terraform/environments/<env> output -raw migration_runner_function_name)" \
  --payload '{"command":"rollback","confirm":true}' \
  --cli-binary-format raw-in-base64-out \
  --log-type Tail \
  --cli-read-timeout 130 \
  response.json
cat response.json
```

The `confirm:true` is mandatory — the Lambda refuses to roll back without it.

## When to roll back vs. fix-forward

| Situation | Do this |
|---|---|
| Bad migration, but data is fine and the fix is additive | **Fix-forward** — new corrective migration |
| Bad migration you want to undo immediately after a deploy, before real writes depend on it | **Rollback** (this runbook) |
| Migration corrupted or destroyed data | **RDS point-in-time restore** (see below) |

Fix-forward is preferred because it uses the same well-exercised forward path, is fully
audited in `knex_migrations`, and never runs untested `down()` code.

## Caveats — read before rolling back prod

- **Rollback can lose data.** A `down()` that drops a column or table **discards that
  data irreversibly**. `up()` is reversible in structure, not in data.
- **`down()` functions are lightly tested.** Forward migrations run on every deploy; `down()`
  paths rarely run against real data. Treat them as unverified in a real incident.
- **Partial batches.** If the original deploy failed midway (some migrations committed, one
  did not), the "last batch" may not be exactly what you expect. Check the current state
  (`{"command":"verify"}`) before and after.
- **Stale lock.** If a rollback (or migrate) is killed mid-run, the `knex_migrations_lock`
  row can remain locked, blocking the next run. Clear it manually / with `knex migrate:unlock`
  before retrying.

## Catastrophic backstop — RDS point-in-time restore

If a migration destroyed data and rollback cannot recover it, the only true undo is at the
data layer: restore the environment's RDS instance to a point in time **before** the deploy.
This loses every write since that point (including in-flight payments) and is an operational
event, not a pipeline action — use it only when the alternative is worse.

## One-time setup / prerequisites

- The **`prod` GitHub Environment** must be configured with **required reviewers** for the
  reviewer gate to take effect.
- The environment deployer role's OIDC trust must permit this workflow to assume it. The
  role already holds `lambda:InvokeFunction` on `*-migrationRunner`
  (`terraform/modules/iam/role-deployer.tf`), so no new permission is required.
