# Runbook: RDS PostgreSQL major version upgrade

How to move an environment's RDS instance to a new PostgreSQL major version
(written for 16 → 17). The version is set per environment by `engine_version` in
`terraform/environments/<env>/main.tf`; the shared [`rds` module](../../terraform/modules/rds/main.tf)
derives the parameter group family and name from it.

> **This procedure has not been rehearsed end to end, and neither has the
> rollback.** Read the whole page before the first upgrade, and update it with
> anything that differed in practice.

---

## Order and windows

Upgrade one environment at a time: **dev, then stg, then prod.** Don't start the
next until the previous one has passed every post-upgrade check below.
`scripts/postgresVersionPins.test.js` fails if prod is ever set above stg, or stg
above dev.

| Env  | Instance                       | Proxy                             | Multi-AZ | What triggers the upgrade                       |
| ---- | ------------------------------ | --------------------------------- | -------- | ----------------------------------------------- |
| dev  | `ustc-payment-processor-db`    | `ustc-payment-processor-proxy`    | no       | Merging the PR (`cicd-dev.yml` deploys on push) |
| stg  | `ustc-payment-portal-stg-db`   | `ustc-payment-portal-stg-proxy`   | yes      | Dispatching `CICD - Staging`                    |
| prod | `ustc-payment-portal-prod-db`  | `ustc-payment-portal-prod-proxy`  | yes      | `prod-deploy.yml` with `plan_only=false`        |

- **Dev** is shared: every PR environment connects to the dev instance directly
  (via `/ustc/pay-gov/dev/rds-endpoint`), so all open PRs' CI fails while dev
  upgrades. Announce a short window to the team, and re-run any PR CI that failed
  during it.
- **Stg and prod** need a window approved by the PO and ops. Being Multi-AZ
  doesn't avoid downtime: both nodes upgrade together, so expect **10–30+ minutes**
  of downtime. Hold other merges and promotions until the environment is done.
- **Once stg and prod are set to 17 on `main`, the next promotion upgrades them**,
  whatever else it ships. Dispatch those promotions yourself, in the window.

---

## Pre-flight (read-only, in each account)

Run these against the account you're about to upgrade. `<id>` is the instance
from the table above.

```bash
# Current version and parameter group
aws rds describe-db-instances --db-instance-identifier <id> \
  --query 'DBInstances[0].[EngineVersion,DBParameterGroups[0].DBParameterGroupName,OptionGroupMemberships[0].OptionGroupName]'

# Which 17.x versions are valid major-upgrade targets from the current version
aws rds describe-db-engine-versions --engine postgres --engine-version <current-version> \
  --query 'DBEngineVersions[0].ValidUpgradeTarget[?IsMajorVersionUpgrade==`true`].EngineVersion'

# The version RDS picks for a major-only "17"
aws rds describe-db-engine-versions --engine postgres --engine-version 17 --default-only \
  --query 'DBEngineVersions[0].EngineVersion'
```

- If the default 17 minor is in the valid-target list, set `engine_version = "17"`.
  If not, set the lowest valid `17.x`, and move it back to `"17"` in a later PR so
  minor versions auto-upgrade again.
- Confirm in the AWS docs that RDS Proxy supports PostgreSQL 17 in our region.
- **Dev only:** the `deploy_dev` job's `timeout-minutes` in `cicd-dev.yml` must be
  at least 90. If the job is killed mid-apply, it leaves a stuck Terraform state lock.
- **Prod only:** take a named manual snapshot before the window (RDS also takes an
  automatic pre-upgrade snapshot, but a named one is easier to find):

  ```bash
  aws rds create-db-snapshot --db-instance-identifier ustc-payment-portal-prod-db \
    --db-snapshot-identifier ustc-payment-portal-prod-db-pre-pg17
  aws rds wait db-snapshot-available --db-snapshot-identifier ustc-payment-portal-prod-db-pre-pg17
  ```

---

## Expected Terraform plan

Review the plan before applying (the PR's plan comment for dev, the workflow
plan for stg, `plan_only=true` for prod). It should show exactly:

- `aws_db_parameter_group.main` **replaced**: a new `<id>-pg17` group (family
  `postgres17`) is created before the old `<id>-pg` group is destroyed.
- `aws_db_instance.main` **updated in place**: `engine_version` and
  `parameter_group_name` change. **It must not say "must be replaced".** If it
  does, stop.
- Lambda, proxy and SSM changes only if the same release also changes them.

---

## During the upgrade

Watch from the account being upgraded:

```bash
aws rds describe-events --source-type db-instance --source-identifier <id> --duration 120
aws logs tail /aws/rds/instance/<id>/upgrade --follow
aws logs tail /aws/rds/instance/<id>/postgresql --since 30m
```

The instance status goes `upgrading` → `available`. The apply waits for this.

---

## After each upgrade

1. **Confirm the version and rebuild planner statistics.** A major upgrade doesn't
   carry statistics over, so queries run on default estimates until `ANALYZE` runs.
   Prod doesn't run migrations automatically either, so this step is always manual.

   ```bash
   MIGRATION_FN=$(terraform -chdir=terraform/environments/<env> output -raw migration_runner_function_name)
   aws lambda invoke --function-name "$MIGRATION_FN" \
     --payload '{"command":"analyze"}' \
     --cli-binary-format raw-in-base64-out --cli-read-timeout 130 \
     response.json && cat response.json
   ```

   `serverVersion` in the body must be `17.x`.

2. **Proxy targets healthy:**

   ```bash
   aws rds describe-db-proxy-targets --db-proxy-name <proxy> \
     --query 'Targets[].TargetHealth.State'
   ```

   Every target should be `AVAILABLE`.

3. **Option and parameter groups:** re-run the first pre-flight command. The
   parameter group should be `<id>-pg17` and the option group `default:postgres-17`.
   The old `<id>-pg` group should be gone:
   `aws rds describe-db-parameter-groups --db-parameter-group-name <id>-pg` should
   return `DBParameterGroupNotFound`.

4. **The app works:** the post-apply migrations, smoke test and (stg) E2E checks in
   the deploy run are green. For dev, the `deploy_dev` integration tests are green.

5. **Upgrade log is clean:** read `/aws/rds/instance/<id>/upgrade` for errors and
   note the result on the ticket.

Expect one round of connection errors from warm Lambdas whose connections were cut
by the restart. They should clear on their own within a few minutes. If they
continue, check the proxy targets again.

### If something fails

- **`AccessDenied` on `og:default:postgres-17`** during apply: the deployer role
  can't touch the new default option group. Add `og:default:postgres-*` to the
  deployer role's RDS resource list in
  [`role-deployer.tf`](../../terraform/modules/iam/role-deployer.tf), do a
  **foundation** apply for that account, then re-run the deploy. Make the same
  change in the other accounts before upgrading them.
- **RDS rejects `"17"`**: switch to the explicit `17.x` from pre-flight.
- **Stuck state lock after a killed apply:** check that the instance shows
  `available` in RDS first, then release the lock with
  `terraform force-unlock <lock-id>`. Don't release it while the upgrade is still
  running.

---

## Rollback

**There is no in-place downgrade.** Rolling back means restoring the pre-upgrade
snapshot to a PostgreSQL 16 instance. Data written after the upgrade is lost
unless you export it first.

Outline (not rehearsed — work it through with ops before relying on it):

1. Find the pre-upgrade snapshot (`aws rds describe-db-snapshots --db-instance-identifier <id>`),
   or use the manual prod snapshot.
2. Rename the upgraded instance so its identifier is free, e.g.
   `aws rds modify-db-instance --db-instance-identifier <id> --new-db-instance-identifier <id>-pg17-failed --apply-immediately`.
3. Restore the snapshot under the original `<id>`, with the same subnet group,
   security groups and Multi-AZ setting, and on stg/prod with
   `--manage-master-user-password`. Restoring under the same identifier keeps
   the endpoint hostname, so the proxy target and the dev SSM endpoint parameter
   resolve to the restored instance.
4. Set `engine_version = "16"` for that environment, then fix Terraform state so
   it tracks the restored instance (`terraform state rm` and `terraform import`
   for `module.rds.aws_db_instance.main`, or `module.rds[0].aws_db_instance.main`
   in dev, run by a human). Apply: this recreates
   the `-pg` parameter group, and on stg/prod picks up the restored instance's new
   master secret ARN for the proxy and Lambdas.
5. Run the post-upgrade checks above, expecting 16.x. Delete
   `<id>-pg17-failed` only once you're sure you don't need it.
