# PAY-276: Per-PR Scoped Database Users (Option C — Hybrid)

## Goal

Each PR workspace gets its own Postgres user, scoped to its own database on the shared dev RDS instance. No PR can reach another PR's data. The TODO at [src/migrationHandler.ts:181-184](../src/migrationHandler.ts#L181-L184) is removed.

## Approach

Split ownership along the natural seam: **Terraform** owns the per-PR Secrets Manager secret (random password, secret, version) — lifecycle binds to the workspace, `terraform destroy` removes it. **The migrationHandler Lambda** owns the Postgres DDL — it already has master credentials via `getMaintenanceKnex` and runs inside the VPC, so no bastion or tunnel is needed.

Two new Lambda commands — `provision-user` and `deprovision-user` — bracket the existing `create-db` and `drop-db` commands in the workflow. Migrations continue to run as the admin role so `ALTER DEFAULT PRIVILEGES` cascades new migration tables to the PR user.

Picked over A (Lambda owns secret → predicted-ARN drift) and B (Terraform owns DDL → requires bastion + SSM tunnel + new provider + ~$3/mo).

## Acceptance Criteria → Implementation

| AC | Mechanism |
| --- | --- |
| Each PR creates its own user | `provision-user` runs `CREATE ROLE` per PR |
| Perms only to its DB/tables | `GRANT CONNECT/USAGE` + `ALTER DEFAULT PRIVILEGES` on the PR DB only |
| No perms to other DBs | Postgres `CONNECT` is per-database; not granted elsewhere |
| TODO removed | Delete lines 181-184 of `migrationHandler.ts` |

## Interface contract (lock before starting)

- Secret name: `ustc/pay-gov/dev/${local.environment}-db-user` (e.g. `ustc/pay-gov/dev/pr-123-db-user`) — fits the existing `ustc/pay-gov/*` IAM wildcard at [terraform/modules/iam/main.tf:46](../terraform/modules/iam/main.tf#L46), no IAM change.
- Secret shape: `{ "username": "...", "password": "..." }` JSON (matches existing `RDS_SECRET_ARN` consumers).
- PR role name: `pr_user_${env_with_underscores}` (e.g. `pr_user_pr_123`).
- New Lambda commands: `provision-user`, `deprovision-user`.
- Migrations run as the admin role (`migrationRunner.RDS_SECRET_ARN` stays on the admin secret).

## Implementation — 5 steps

Steps 1-3 can be parallelized with steps 4-5 across two developers (file-disjoint). The PR is only complete when all five land.

### Step 1 — Terraform: create the per-PR secret ✅ done

**New `terraform/environments/dev/pr_user_secret.tf`** — `random_password`, `aws_secretsmanager_secret`, `aws_secretsmanager_secret_version`, all gated `count = local.is_pr ? 1 : 0`.

Key choices: `special = false` on the password (avoids JSON/connstring escaping), `recovery_window_in_days = 0` (PR teardown must be immediate; no soft-delete window blocking reopen of the same PR number).

### Step 2 — Terraform: wire Lambda env vars ✅ done

**Modify `terraform/environments/dev/locals.tf`** — add three new locals:

```hcl
is_pr              = local.environment != "dev"
pr_role            = local.is_pr ? "pr_user_${replace(local.environment, "-", "_")}" : null
app_rds_secret_arn = local.is_pr ? aws_secretsmanager_secret.pr_user[0].arn : local.rds_secret_arn
```

Point `lambda_env_payment.RDS_SECRET_ARN` and `lambda_env_dashboard.RDS_SECRET_ARN` at `app_rds_secret_arn`. Leave `lambda_env_migration.RDS_SECRET_ARN` on the admin secret. Add `PR_USER_SECRET_ARN` to the migration env via a `merge()` so it's only present in PR workspaces.

### Step 3 — Lambda: add provision-user and deprovision-user

**Modify `src/migrationHandler.ts`** — two new commands, TODO at lines 181-184 deleted.

- `provision-user`: read PR secret → `CREATE ROLE ... LOGIN PASSWORD` in the maintenance DB (idempotent via `DO $$ ... IF NOT EXISTS`) → switch connection to PR DB → `GRANT CONNECT/USAGE` + `ALTER DEFAULT PRIVILEGES` for the admin role so future migration tables auto-grant to the PR user.
- `deprovision-user`: in PR DB → `pg_terminate_backend` for the PR role's sessions → `REASSIGN OWNED` to admin → `DROP OWNED`. Then in maintenance DB → `DROP ROLE IF EXISTS`.

Both commands gated by `PR_USER_SECRET_ARN` env var presence (no-op in dev workspace).

### Step 4 — Workflow: invoke the new commands

**Modify `.github/workflows/cicd-dev.yml`**:

- Add `provision-user` Lambda invoke immediately after the existing `create-db` step (~line 210).
- Add `deprovision-user` Lambda invoke immediately before the existing `drop-db` step (~line 401).
- `migrate` invoke stays unchanged.

### Step 5 — Tests

**Modify `src/migrationHandler.test.ts`** — cover both new commands:

- Happy path (assert SQL via `knex.raw` spy).
- Idempotency: re-running `provision-user` with role already present uses `ALTER ROLE`.
- Drop ordering: `pg_terminate_backend` → `REASSIGN OWNED` → `DROP OWNED` → `DROP ROLE`.
- `deprovision-user` when role missing: `IF EXISTS` succeeds silently.

Target ≥90% line coverage on the new code paths (Definition of Done).

## Postgres DDL — canonical sequences

**Provision** (Lambda, as admin):

```sql
-- maintenance DB:
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pr_user_pr_123') THEN
    CREATE ROLE pr_user_pr_123 LOGIN PASSWORD '<from secret>';
  ELSE
    ALTER ROLE pr_user_pr_123 WITH LOGIN PASSWORD '<from secret>';
  END IF;
END $$;

-- PR DB (paymentportal_pr_123):
GRANT CONNECT ON DATABASE paymentportal_pr_123 TO pr_user_pr_123;
GRANT USAGE ON SCHEMA public TO pr_user_pr_123;
ALTER DEFAULT PRIVILEGES FOR ROLE payment_portal_admin IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES    TO pr_user_pr_123;
ALTER DEFAULT PRIVILEGES FOR ROLE payment_portal_admin IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE          ON SEQUENCES TO pr_user_pr_123;
```

**Deprovision**:

```sql
-- PR DB:
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
  WHERE usename = 'pr_user_pr_123' AND pid <> pg_backend_pid();
REASSIGN OWNED BY pr_user_pr_123 TO payment_portal_admin;
DROP OWNED BY pr_user_pr_123;

-- maintenance DB:
DROP ROLE IF EXISTS pr_user_pr_123;
```

## Tests & rollback

**Integration** (the PR pipeline is the only real signal): apply → app Lambdas read/write as PR user → `psql` as PR user proves `\c paymentportal_pr_<other>` is rejected → close PR → role/secret/DB all gone → reopen same PR number works with fresh password.

**Rollback**: revert the PR. Gated by `local.is_pr` and command-dispatch — no infra to undo, no migrations to roll back.

## Risks

| Risk | Mitigation |
| --- | --- |
| `provision-user` runs before secret exists | Workflow order: terraform apply → create-db → provision-user → migrate |
| `DROP ROLE` fails (owned objects / open conns) | `pg_terminate_backend` → `REASSIGN OWNED` → `DROP OWNED` precede it |
| `ALTER DEFAULT PRIVILEGES` only affects future tables | Migrations run after the role exists — order is correct by construction |
| Workflow retry re-invokes `provision-user` | DDL is idempotent: `DO` block guards `CREATE ROLE`; `GRANT`/`ALTER DEFAULT PRIVILEGES` are inherently idempotent |

## Out of scope

Staging/prod (single shared DB). Local dev (unaffected). RDS IAM auth (separate ticket).
