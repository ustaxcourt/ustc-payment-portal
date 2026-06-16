# Deploy workflow — improvement backlog

Improvements for the staging→production deploy workflow: automated tests we
believe we need to build, plus infrastructure/hardening gaps surfaced while
documenting the pipeline. Each item was verified against the codebase, not a
guess. Effort is a rough t-shirt size (S ≈ <1 day, M ≈ 1–3 days, L ≈ multi-day /
needs design).

Context for all items: [`deploy-pre-golive.md`](deploy-pre-golive.md),
[`deploy-post-golive.md`](deploy-post-golive.md),
[`deploy-rollback.md`](deploy-rollback.md).

---

## Part 1 — Automated tests to build

### T1. Prod post-deploy smoke / health check *(synthetic, read-only)*

- **Priority:** High
- **Why:** `prod-deploy.yml` has its smoke-test step **commented out**, so Prod
  currently has **no automated post-deploy verification**. For an app whose value
  is uptime, nothing automatically confirms a Prod deploy worked.
- **Build:** a post-apply health check in `prod-deploy.yml`. **Constraint:** it
  must **not** run a real Pay.gov transaction (real money), unlike the staging
  `/init` smoke test — make it a read-only / synthetic check (e.g. an auth'd call
  to a safe endpoint asserting 200, or a dedicated health route).
- **Effort:** M

### T2. Run the integration suite against Staging as a pipeline gate

- **Priority:** High
- **Why:** Stage 3 verification (full transaction end-to-end) is **manual**
  today — the staging workflow only smoke-tests `/init`, not a full transaction.
  Automating it removes a human eyeball from every deploy and makes the staging
  gate trustworthy. (There is no Cypress suite in this repo; the Jest integration
  tests in `src/test/integration/` are the end-to-end check.)
- **Build:** run `npm run test:integration` (SigV4-signed) against the Staging API
  after `staging-deploy.yml` as a gate; fail the promotion if it fails.
- **Effort:** M

### T3. CI migration-safety check (enforce expand-contract)

- **Priority:** High
- **Why:** Rollback safety depends on backward-compatible migrations
  (see [`deploy-rollback.md`](deploy-rollback.md)) — but nothing **enforces** it.
  A destructive migration shipped with dependent code cannot be rolled back
  (there is no automated down-migration; see G2).
- **Build:** a CI check that flags destructive operations (drop column/table,
  non-nullable-without-default, rename) in new `db/migrations/` files and
  requires explicit sign-off.
- **Effort:** M

### T4. Integration tests for the `migrationRunner` Lambda

- **Priority:** Medium
- **Why:** `src/migrationHandler.ts` carries an in-code note that testing it
  requires PR-ephemeral RDS environments. Migrations are infra-critical and
  currently unverified by integration tests.
- **Build:** ephemeral-RDS integration tests covering `migrate`/`verify` (and the
  DB/role admin commands) per the existing TODO in the handler.
- **Effort:** L *(depends on ephemeral RDS provisioning)*

---

## Part 2 — Infrastructure / hardening gaps

These are not tests, but they block or weaken the documented workflow and belong
in the same backlog.

### G1. Build a Production DB-migration path **(GO-LIVE BLOCKER)**

- **Priority:** Critical / blocker
- **Why:** `terraform/environments/prod/` defines **no migration Lambda at all**.
  Staging deploys a `migrationRunner` and runs it; Prod has nothing. **Any
  release containing a schema migration has no supported path to Prod.**
- **Build:** deploy a `migrationRunner` to Prod for parity (and wire a migration
  step into `prod-deploy.yml`), or define an approved alternative.
- **Effort:** M–L

### G2. Provide an automated DB migration-rollback path

- **Priority:** High
- **Why:** The `migrationRunner` Lambda has **no `rollback`/`down` command** —
  `migrate` is forward-only. There is no automated way to reverse a migration in
  any deployed environment; reversal is manual or a new forward migration.
- **Build:** add a guarded `rollback`/`down` command to the migration Lambda, or
  document a sanctioned manual RDS procedure. Pairs with G1.
- **Effort:** M

### G3. Harden the RC-release → Prod-trigger coupling

- **Priority:** Medium
- **Why:** `rc-release.yml` creates a **normal** GitHub Release (not a
  pre-release) for RC tags. The only thing preventing it from triggering a Prod
  deploy is GitHub's "no re-trigger from `GITHUB_TOKEN`" rule — implicit and
  fragile. A manual re-publish or a switch to a PAT would fire `prod-deploy.yml`.
- **Build:** set `prerelease: true` on RC releases **and** filter the
  `prod-deploy.yml` `release` trigger to skip `*-rc.*` tags (defense in depth).
- **Effort:** S

### G4. Configure a required reviewer on the `production` GitHub Environment

- **Priority:** High
- **Why:** Verified via the GitHub API — the `production` environment has
  **no protection rules**. The `environment: production` block in
  `prod-deploy.yml` is only a label; there is **no enforced approval gate** on
  Prod applies today.
- **Build:** add a required reviewer (and any branch policy) to the `production`
  environment. Prerequisite for the post-go-live approval gate.
- **Effort:** S

### G5. Add a transaction read-view for Staging/Prod

- **Priority:** Medium
- **Why:** The transaction dashboard endpoints are gated to `dev`/`pr-*` in
  `terraform/modules/api-gateway/main.tf`, so there is **no dashboard in Staging
  or Prod**. Verification there relies on `getDetails`/CloudWatch logs.
- **Build:** a read-only transaction view (or equivalent) available in non-Dev
  environments, with appropriate access control.
- **Effort:** M

### G6. Remove the `aws sts get-caller-identity` debug steps

- **Priority:** Low / cleanup
- **Why:** Both `staging-deploy.yml` and `prod-deploy.yml` contain
  `Verify AWS caller identity` steps explicitly labelled "to be removed later".
- **Build:** delete the debug steps from both workflows.
- **Effort:** S

---

## Suggested ordering

1. **G1** (Prod migration path) — go-live blocker.
2. **G4** (Prod reviewer) and **G3** (trigger hardening) — small, high-value safety.
3. **T1** (Prod health check) and **T2** (integration suite in pipeline) — close the
   verification gaps the runbooks rely on humans for.
4. **G2** (migration rollback) and **T3** (migration-safety check) — rollback safety.
5. **T4** (migration Lambda tests), **G5** (Staging/Prod read-view), **G6** (cleanup).
