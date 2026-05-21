# PAY-276: Per-PR Scoped Database Users (Option B — Terraform-owned)

## Goal

Each PR workspace gets its own Postgres user, scoped to its own database on the shared dev RDS instance. No PR can reach another PR's data. The TODO at [src/migrationHandler.ts:181-184](../src/migrationHandler.ts#L181-L184) is removed.

## Approach

The `cyrilgdn/postgresql` provider owns the per-PR database, role, secret, and grants. Lifecycle binds to the workspace: `terraform apply` provisions, `terraform destroy` tears down. The Lambda stops creating/dropping DBs — it only runs migrations and seeds.

The one non-obvious load-bearing decision: **migrations continue to run as the admin role, not the PR user.** Reason: `postgresql_default_privileges` cascades grants from the table owner. If migrations ran as the PR user, the PR user would own its tables and the default-privileges mechanism wouldn't apply on subsequent role changes. Admin owns tables → PR user gets automatic SELECT/INSERT/UPDATE/DELETE on every future migration's table.

## Prerequisite: VPC reachability for Terraform

RDS is private. Terraform's postgres provider must reach it during apply *and* destroy.

**Decision:** add a `t4g.nano` SSM-managed bastion in the dev VPC (~$3/mo). GitHub-hosted runners assume the OIDC role, then `aws ssm start-session --document-name AWS-StartPortForwardingSessionToRemoteHost` opens `localhost:5432` → RDS:5432 for the apply/destroy steps.

Alternative considered: AWS CodeBuild as the runner (VPC-native). Rejected — bigger CI rewrite for the same outcome. Bastion is reversible.

## Implementation

### 1. Bastion module

New `terraform/modules/db_bastion/` — single `t4g.nano`, no SSH, `AmazonSSMManagedInstanceCore` instance profile, SG with outbound 5432 to RDS only. RDS SG gains ingress from the bastion SG. Instantiated once in [terraform/environments/dev/main.tf](../terraform/environments/dev/main.tf) under `count = local.environment == "dev" ? 1 : 0` — shared across all PR workspaces. Instance ID exported to SSM Parameter Store for the workflow to discover.

### 2. Postgres provider + per-PR resources

`terraform/environments/dev/versions.tf` adds `cyrilgdn/postgresql ~> 1.23`.

`terraform/environments/dev/locals.tf` gains `is_pr`, `pr_db_name`, `pr_role`. New file `terraform/environments/dev/pr_database.tf` (all resources gated `count = local.is_pr ? 1 : 0`):

```hcl
data "aws_secretsmanager_secret_version" "rds_admin" {
  secret_id = data.aws_ssm_parameter.dev_rds_secret_arn[0].value
}

locals {
  admin = jsondecode(data.aws_secretsmanager_secret_version.rds_admin[0].secret_string)
}

provider "postgresql" {
  host     = "localhost"  # SSM port-forward terminus
  port     = 5432
  database = "postgres"
  username = local.admin.username
  password = local.admin.password
  sslmode  = "require"
}

resource "random_password" "pr_user" { length = 32, special = false }

resource "aws_secretsmanager_secret"         "pr_user" { name = "ustc-payment-portal/${local.environment}/db-user", recovery_window_in_days = 0 }
resource "aws_secretsmanager_secret_version" "pr_user" { secret_id = aws_secretsmanager_secret.pr_user[0].id, secret_string = jsonencode({ username = local.pr_role, password = random_password.pr_user[0].result }) }

resource "postgresql_role"     "pr_user" { name = local.pr_role, login = true, password = random_password.pr_user[0].result }
resource "postgresql_database" "pr_db"   { name = local.pr_db_name, owner = local.admin.username }

resource "postgresql_grant" "connect" { database = postgresql_database.pr_db[0].name, role = postgresql_role.pr_user[0].name, object_type = "database", privileges = ["CONNECT"] }
resource "postgresql_grant" "schema"  { database = postgresql_database.pr_db[0].name, role = postgresql_role.pr_user[0].name, schema = "public", object_type = "schema", privileges = ["USAGE"] }

# Cascades to every table/sequence migrations create later, since admin owns them.
resource "postgresql_default_privileges" "tables"    { database = postgresql_database.pr_db[0].name, schema = "public", owner = local.admin.username, role = postgresql_role.pr_user[0].name, object_type = "table",    privileges = ["SELECT","INSERT","UPDATE","DELETE"] }
resource "postgresql_default_privileges" "sequences" { database = postgresql_database.pr_db[0].name, schema = "public", owner = local.admin.username, role = postgresql_role.pr_user[0].name, object_type = "sequence", privileges = ["USAGE","SELECT","UPDATE"] }
```

### 3. Lambda env var swap

In `locals.tf`, introduce `app_rds_secret_arn = local.is_pr ? aws_secretsmanager_secret.pr_user[0].arn : local.rds_secret_arn`.

- `lambda_env_payment.RDS_SECRET_ARN` → `app_rds_secret_arn`
- `lambda_env_dashboard.RDS_SECRET_ARN` → `app_rds_secret_arn`
- `lambda_env_migration.RDS_SECRET_ARN` → stays `local.rds_secret_arn` (admin, runs migrations)

`RDS_MASTER_SECRET_ARN` is removed from `lambda_env_migration` — Lambda no longer needs it.

### 4. Strip dead code

[src/migrationHandler.ts](../src/migrationHandler.ts): delete `createDb`, `dropDb`, `gcDbs`, `getMaintenanceKnex`, the matching command-dispatch branches, and the TODO. The `Command` type collapses to `"migrate" | "seed" | "verify"`.

[src/migrationHandler.test.ts](../src/migrationHandler.test.ts): delete the create-db / drop-db / gc-dbs blocks; drop `RDS_MASTER_SECRET_ARN` from setup.

[terraform/modules/iam/main.tf](../terraform/modules/iam/main.tf): remove migrationRunner's `CreateDatabase`-related grants on the master secret (Lambda no longer reads it).

### 5. Workflow changes

[.github/workflows/cicd-dev.yml](../.github/workflows/cicd-dev.yml):

- **New step before `Terraform Apply`**: open the SSM tunnel (background process, wait for `localhost:5432` to accept connections, store PID).
- **New step on job exit**: kill the tunnel PID.
- **Remove** the `create-db` invoke ([line 210](../.github/workflows/cicd-dev.yml#L210)) and the `drop-db` invoke ([line 401](../.github/workflows/cicd-dev.yml#L401)).
- **Keep** the `migrate` invoke unchanged.

[.github/workflows/gc-pr-dbs.yml](../.github/workflows/gc-pr-dbs.yml): repurpose from auto-drop to alert-only. Under Option B, an orphan DB means a failed `terraform destroy` and should be investigated, not swept.

### 6. Destroy ordering

Postgres refuses to drop a role that owns objects or a DB with open connections. Add a `null_resource` with `when = destroy` provisioner that runs before the `postgresql_database` destroys:

```hcl
resource "null_resource" "pre_destroy" {
  triggers = { db = local.pr_db_name, role = local.pr_role, admin_user = local.admin.username, admin_pw = local.admin.password }
  provisioner "local-exec" {
    when    = destroy
    command = <<-EOT
      PGPASSWORD='${self.triggers.admin_pw}' psql -h localhost -U ${self.triggers.admin_user} -d postgres -c "
        SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${self.triggers.db}';
        REASSIGN OWNED BY ${self.triggers.role} TO ${self.triggers.admin_user};
        DROP OWNED BY ${self.triggers.role};"
    EOT
  }
}
```

Admin creds are captured in `triggers` so the data source isn't needed at destroy time.

## Tests

- **Jest**: delete obsolete create-db/drop-db/gc-dbs cases; assert `migrate` works without `RDS_MASTER_SECRET_ARN`.
- **`terraform validate`** on dev workspace and a sample PR workspace.
- **End-to-end on the validation PR**:
  1. Apply → app Lambdas read/write via PR user.
  2. Connect as PR user via `psql` → `\l` shows only the PR's DB accessible; cross-DB `\c` rejected.
  3. Close PR → destroy succeeds → role, DB, secret all gone.
  4. Reopen same PR number → fresh credentials, no name collision.

## Rollback

Reachable via revert of the PR — the change is gated by `local.is_pr` and the postgres provider. To roll back without revert: point `app_rds_secret_arn` back to the admin secret, restore the Lambda commands from git, re-add the workflow invokes, `terraform destroy` orphans. Bastion + IAM stay (cheap, harmless).

## Risks

| Risk | Mitigation |
|---|---|
| SSM tunnel flakes mid-apply | Readiness loop on `localhost:5432`; retry apply once |
| Tunnel not running during destroy | Same tunnel step must run in the cleanup job, not just apply |
| `default_privileges` only covers *future* tables | All app tables come from migrations that run after the role exists — order is correct by construction |
| Concurrent PR applies contend | Tunnel binds runner-local 5432; isolated per runner |
| Bastion = SPOF for PR provisioning | Acceptable for dev. If it bottlenecks, move to CodeBuild |

## Out of scope

Staging/prod (single shared DB). Local dev (unaffected). RDS IAM auth (separate ticket).
