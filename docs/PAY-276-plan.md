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

## Implementation

Two concurrent workstreams on one PR branch.

### Interface contract (lock before either dev starts)

- Secret name: `ustc/pay-gov/dev/pr-${env}-db-user` — fits the existing `ustc/pay-gov/*` IAM wildcard at [terraform/modules/iam/main.tf:46](../terraform/modules/iam/main.tf#L46), no IAM change.
- Secret shape: `{ "username": "...", "password": "..." }` JSON (matches existing `RDS_SECRET_ARN` consumers).
- PR role name: `pr_user_${env_with_underscores}`.
- New Lambda commands: `provision-user`, `deprovision-user`.
- Migrations run as the admin role (`migrationRunner.RDS_SECRET_ARN` stays on the admin secret).

### Workstream A — Terraform + Lambda DDL

**A1.** New `terraform/environments/dev/pr_user_secret.tf` — `random_password`, `aws_secretsmanager_secret`, `aws_secretsmanager_secret_version`, all gated `count = local.is_pr ? 1 : 0`.

**A2.** Modify `terraform/environments/dev/locals.tf` — add `is_pr`, `pr_role`, `app_rds_secret_arn`. Point `lambda_env_payment.RDS_SECRET_ARN` and `lambda_env_dashboard.RDS_SECRET_ARN` at `app_rds_secret_arn`; leave `lambda_env_migration` on the admin secret. Wire `PR_USER_SECRET_ARN` into the migration Lambda's env.

**A3.** Modify `src/migrationHandler.ts` — add `provision-user` (reads PR secret → CREATE ROLE in maintenance DB → GRANTs + ALTER DEFAULT PRIVILEGES in PR DB) and `deprovision-user` (terminate connections → REASSIGN OWNED → DROP OWNED → DROP ROLE). Delete the TODO. Idempotency via a `DO $$ ... IF NOT EXISTS` guard around `CREATE ROLE`.

### Workstream B — Workflow + tests

**B1.** Modify `.github/workflows/cicd-dev.yml` — invoke `provision-user` immediately after the existing `create-db` step (~line 210) and `deprovision-user` immediately before the existing `drop-db` step (~line 401). `migrate` invoke stays unchanged.

**B2.** Modify `src/migrationHandler.test.ts` — cover both new commands: happy path (assert SQL via `knex.raw` spy), idempotency (re-run with role already present), drop ordering (terminate → REASSIGN → DROP OWNED → DROP ROLE), drop when role missing (`IF EXISTS` succeeds silently). Target ≥90% coverage on new code paths.

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
