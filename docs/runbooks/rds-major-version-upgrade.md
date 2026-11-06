# Runbook: RDS PostgreSQL major version upgrade

How to move an environment's RDS instance to a new PostgreSQL major version
(written for 16 → 18). The version is set per environment by `engine_version` in
`terraform/environments/<env>/main.tf`; the shared [`rds` module](../../terraform/modules/rds/main.tf)
derives the parameter group family and name from it.

Every environment pins an **exact** version (e.g. `"18.6"`), and the module turns
off `auto_minor_version_upgrade`. Any engine change, minor or major, restarts the
database, so the version only moves in a reviewed PR applied in a planned window.
Each environment also leaves the module's `apply_immediately` at its default
`false` outside its own upgrade, so routine size or storage changes still wait for
the maintenance window.

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
- **Once stg and prod are set to 18 on `main`, the next promotion upgrades them**,
  whatever else it ships. Dispatch those promotions yourself, in the window.

---

## Pre-flight (read-only, in each account)

Run these against the account you're about to upgrade. `<id>` is the instance
from the table above.

```bash
# Current version and parameter group
aws rds describe-db-instances --db-instance-identifier <id> \
  --query 'DBInstances[0].[EngineVersion,DBParameterGroups[0].DBParameterGroupName,OptionGroupMemberships[0].OptionGroupName]'

# Which 18.x versions are valid major-upgrade targets from the current version
aws rds describe-db-engine-versions --engine postgres --engine-version <current-version> \
  --query 'DBEngineVersions[0].ValidUpgradeTarget[?IsMajorVersionUpgrade==`true`].EngineVersion'
```

- Set `engine_version` to an exact `18.x` from the valid-target list, the same one
  for every environment (dev was upgraded to `18.6`).
- In the same change, set `apply_immediately = true` for that environment's
  `module "rds"`. Without it, RDS defers the upgrade to the maintenance window
  while the apply reports success.
- **Environments not being upgraded:** check their pin still matches the live
  version (`aws rds describe-db-instances ... EngineVersion`). If AWS upgraded the
  minor, for example to 16.14, update the pin first. Otherwise the plan tries to
  move it back to 16.13.
- RDS Proxy supports all PostgreSQL 18 versions in `us-east-1`, checked
  2026-10-30 against
  [Supported Regions and DB engines for RDS Proxy](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.RDS_Fea_Regions_DB-eng.Feature.RDSProxy.html).
  Re-check that page for a later target version.
- **Parameter values for a new major:** the module's tests use a mock provider,
  so only RDS validates parameter values. Compare each parameter
  [`modules/rds/main.tf`](../../terraform/modules/rds/main.tf) sets against the new
  family's allowed values (once per new major; it caught `log_connections` on 18):

  ```bash
  aws rds describe-engine-default-parameters --db-parameter-group-family postgres18 \
    --query "EngineDefaults.Parameters[?ParameterName=='log_connections' || ParameterName=='log_disconnections' || ParameterName=='log_statement' || ParameterName=='log_min_duration_statement'].[ParameterName,AllowedValues,DataType]" \
    --output table
  ```

- **Foundation applied first:** the deployer role in
  [`role-deployer.tf`](../../terraform/modules/iam/role-deployer.tf) must allow
  `og:default:postgres-*`, because the upgrade moves the instance onto the new
  default option group. That role lives in foundation, so a human runs the
  foundation apply for the account (`foundation/<env>-networking`) before the
  window. Check it's live in the role's `<role>-rds` managed policy (dev's role is
  `ustc-payment-processor-dev-cicd-deployer-role`):

  ```bash
  ROLE=<deployer-role>
  ARN=$(aws iam list-attached-role-policies --role-name "$ROLE" \
    --query "AttachedPolicies[?PolicyName=='${ROLE}-rds'].PolicyArn" --output text)
  VER=$(aws iam get-policy --policy-arn "$ARN" --query Policy.DefaultVersionId --output text)
  aws iam get-policy-version --policy-arn "$ARN" --version-id "$VER" \
    --query PolicyVersion.Document | grep 'og:default:postgres'
  ```

- **Dev only:** the `deploy_dev` job's `timeout-minutes` in `cicd-dev.yml` must be
  at least 90. If the job is killed mid-apply, it leaves a stuck Terraform state lock.
- **Prod only:** take a named manual snapshot before the window (RDS also takes an
  automatic pre-upgrade snapshot, but a named one is easier to find):

  ```bash
  aws rds create-db-snapshot --db-instance-identifier ustc-payment-portal-prod-db \
    --db-snapshot-identifier ustc-payment-portal-prod-db-pre-pg18
  aws rds wait db-snapshot-available --db-snapshot-identifier ustc-payment-portal-prod-db-pre-pg18
  ```

---

## Expected Terraform plan

Review the plan before applying (the PR's plan comment for dev, the workflow
plan for stg, `plan_only=true` for prod). It should show exactly:

- `aws_db_parameter_group.main` **replaced**: a new `<id>-pg18` group (family
  `postgres18`) is created before the old `<id>-pg` group is destroyed.
- `aws_db_instance.main` **updated in place**: `engine_version`,
  `parameter_group_name`, and `apply_immediately` (`false -> true`) change.
  **It must not say "must be replaced".** If it does, stop.
- **Other environments:** no `engine_version`, `parameter_group_name` or
  `apply_immediately` change. An `engine_version` diff there means the pin no
  longer matches the live version.
- **First apply after PAY-471 only:** every environment also shows
  `auto_minor_version_upgrade` `true -> false`. That change doesn't restart the
  database.
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

The `upgrade` log group only exists once RDS writes its first upgrade log, so
`aws logs tail` returns `ResourceNotFoundException` until the upgrade starts.
Follow `describe-events` until then.

---

## After each upgrade

1. **Confirm the version and rebuild planner statistics.** PostgreSQL 18 keeps most
   planner statistics through the upgrade but not extended statistics, and older
   targets keep none, so run `ANALYZE` every time.
   Prod doesn't run migrations automatically either, so this step is always manual.

   ```bash
   MIGRATION_FN=$(terraform -chdir=terraform/environments/<env> output -raw migration_runner_function_name)
   aws lambda invoke --function-name "$MIGRATION_FN" \
     --payload '{"command":"analyze"}' \
     --cli-binary-format raw-in-base64-out --cli-read-timeout 130 \
     response.json && cat response.json
   ```

   `serverVersion` in the body must be `18.x`.

2. **Proxy targets healthy:**

   ```bash
   aws rds describe-db-proxy-targets --db-proxy-name <proxy> \
     --query 'Targets[].TargetHealth.State'
   ```

   Every target should be `AVAILABLE`.

3. **Option and parameter groups:** re-run the first pre-flight command. The
   parameter group should be `<id>-pg18` and the option group `default:postgres-18`.
   The old `<id>-pg` group should be gone:
   `aws rds describe-db-parameter-groups --db-parameter-group-name <id>-pg` should
   return `DBParameterGroupNotFound`.

4. **The app works:** the post-apply migrations, smoke test and (stg) E2E checks in
   the deploy run are green. For dev, the `deploy_dev` integration tests are green.

5. **Upgrade log is clean:** read `/aws/rds/instance/<id>/upgrade` for errors and
   note the result on the ticket.

6. **Stg and prod:** in a follow-up PR, set `apply_immediately` back to `false`
   (remove the line), so later changes go back to waiting for the maintenance
   window. Dev can keep `true`.

Expect one round of connection errors from warm Lambdas whose connections were cut
by the restart. They should clear on their own within a few minutes. If they
continue, check the proxy targets again.

### If something fails

- **`AccessDenied` on `og:default:postgres-18`** during apply: the foundation
  apply from pre-flight hasn't run in that account. Run it, then re-run the deploy.
- **RDS rejects the pinned `18.x`**: pick another version from the pre-flight
  valid-target list.
- **`InvalidParameterValue` on `ModifyDBParameterGroup`** for the new group: a
  parameter the module sets changed type in the new major (18 made
  `log_connections` a list). The instance hasn't been touched yet. Fix the value
  in [`modules/rds/main.tf`](../../terraform/modules/rds/main.tf), then run a plan:
  if the new group shows as `tainted`, a human runs
  `terraform untaint 'module.rds.aws_db_parameter_group.main'`
  (`module.rds[0]` in dev) before the next deploy, or `create_before_destroy` fails
  on the existing name.
- **Stuck state lock after a killed apply:** check that the instance shows
  `available` in RDS first, then release the lock with
  `terraform force-unlock <lock-id>`. Don't release it while the upgrade is still
  running.

---

## Minor version patches

Minor patches (e.g. 18.6 → 18.7) are not automatic. They restart the database for
a few minutes, so they follow the same path as a major upgrade, on a smaller
scale: a PR that bumps `engine_version`, then dev, stg and prod in turn, with
`apply_immediately = true` for the environment being patched. The parameter group
doesn't change.

- **Watch for security releases** on the
  [PostgreSQL release notes](https://www.postgresql.org/docs/release/) and patch
  when one affects us.
- **AWS still forces deprecated minors.** When AWS announces the end of support
  for a minor, it upgrades remaining instances on its own date, in the maintenance
  window. Bump the pin before that date, or the forced upgrade lands unplanned and
  the next plan shows drift.

---

## Rollback

**There is no in-place downgrade.** Rolling back means restoring the pre-upgrade
snapshot to a PostgreSQL 16 instance. Data written after the upgrade is lost
unless you export it first.

Outline (not rehearsed — work it through with ops before relying on it):

1. Find the pre-upgrade snapshot (`aws rds describe-db-snapshots --db-instance-identifier <id>`),
   or use the manual prod snapshot.
2. Rename the upgraded instance so its identifier is free, e.g.
   `aws rds modify-db-instance --db-instance-identifier <id> --new-db-instance-identifier <id>-pg18-failed --apply-immediately`.
3. Restore the snapshot under the original `<id>`, with the same subnet group,
   security groups and Multi-AZ setting, and on stg/prod with
   `--manage-master-user-password`. Restoring under the same identifier keeps
   the endpoint hostname, so the proxy target and the dev SSM endpoint parameter
   resolve to the restored instance.
4. Set `engine_version` back to the snapshot's exact 16.x version for that
   environment, then fix Terraform state so
   it tracks the restored instance (`terraform state rm` and `terraform import`
   for `module.rds.aws_db_instance.main`, or `module.rds[0].aws_db_instance.main`
   in dev, run by a human). Apply: this recreates
   the `-pg` parameter group, and on stg/prod picks up the restored instance's new
   master secret ARN for the proxy and Lambdas.
5. Run the post-upgrade checks above, expecting 16.x. Delete
   `<id>-pg18-failed` only once you're sure you don't need it.
