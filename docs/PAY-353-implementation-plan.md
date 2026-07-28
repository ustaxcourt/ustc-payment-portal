# PAY-353 — CI Migration-Safety Check (enforce expand-contract) — Implementation Plan

> **Story:** As a Dev Ops engineer, so that I can have confidence that a failed
> deployment can be safely (re)deployed with zero downtime and rolled back, I need a
> CI migration-safety check.
>
> **Description:** Rollback safety depends on backward-compatible migrations. A
> destructive migration shipped with dependent code cannot be rolled back. We need a CI
> check that flags destructive operations (drop column/table, non-nullable-without-default,
> rename) in new `db/migrations/` files and requires explicit sign-off. **Operational in
> every environment.**
>
> **AC1:** A GitHub action exists to check new migrations (PR → action → read migration
> files → detect destructive operations).
> **AC2:** If destructive SQL is found, require manual approval before deployment
> (developer opens PR → CI detects e.g. `DROP COLUMN` → deployment pauses → reviewer
> approves → deployment continues).

## Why this exists (expand-contract)

Zero-downtime + rollback safety require every migration to be **backward compatible** with
the currently-running code. Destructive changes break that: once dependent code ships, you
can't roll back to it because the schema it needs is gone. The safe pattern is
**expand-contract** — expand (additive) now, contract (destructive) in a later release once
no code depends on the old shape. This check enforces that destructive/contract steps get a
deliberate human sign-off rather than sliding through with a normal deploy.

## Scope

**In scope**
1. A tested detector that flags destructive DDL in newly-added migrations.
2. A **reusable workflow** wrapping the detector (one implementation, called everywhere).
3. **PR-level signal**: sticky comment with findings + a required status check.
4. **Deploy-level gate**: when destructive SQL is present, the migrate/apply job pauses for
   a GitHub-native **required-reviewer** approval — in every environment.
5. An **acknowledgment / sign-off** escape hatch (destructive changes are allowed *with*
   explicit approval, not prohibited).
6. Runbook docs.

**Out of scope**
- Rewriting or auto-fixing existing migrations.
- Detecting non-DDL data risks (e.g. a destructive `UPDATE`/`DELETE` inside a migration) —
  possible follow-up; this ticket targets the schema ops named in the description.
- Blocking non-migration PRs.
- Runtime/production data validation.

## Key design decisions (settled)

- **Detection = runtime SQL capture (Mode B), not static file scan.** Run the new
  migrations against an ephemeral Postgres and scan the **emitted SQL**, rather than
  pattern-matching TypeScript. This catches `knex.raw`, complex builder chains, and only
  ever sees forward (`up`) SQL — far fewer false negatives, and lower long-term maintenance.
  The expensive parts already exist in the repo (docker Postgres, `scripts/ensure-test-db.js`,
  `npm run test:db:setup`, Knex + `migrate:latest`), so the incremental cost is mainly the
  two-phase base→head orchestration.
- **Reusable unit = a reusable workflow (`on: workflow_call`), not a composite action.**
  Mode B needs a Postgres **service**, which is job-level and can't live in a composite
  action. The reusable workflow owns the service and returns `has_destructive` + findings as
  outputs.
- **Deploy approval = `trstringer/manual-approval` step** (chosen for simplicity). A single
  approval step, gated `if: has_destructive`, runs before `terraform apply` and opens an issue
  that a reviewer must approve (its pause→approve→continue behavior *is* AC2). Chosen over a
  native protected-Environment gate so the pause is conditional in one job with no extra
  environments; the tradeoff is a **third-party action in the deploy path** (pin to a SHA). PR
  sign-off = required status check + an in-file acknowledgment marker.
- **Two layers, by design.** PR-level for early visibility; deploy-level for enforcement.
  Same detector powers both.

## Detection rules

| Rule | Emitted SQL matched | Safe expand-contract alternative |
|---|---|---|
| Drop table | `DROP TABLE` | Drop in a later contract migration, after code stops using it |
| Drop column | `DROP COLUMN` | Same — contract step in a later release |
| Rename table/column | `RENAME TO`, `RENAME COLUMN`, `ALTER TABLE … RENAME` | Add new + backfill + dual-read, drop old later |
| Add NOT NULL without default | `ADD COLUMN … NOT NULL` (no `DEFAULT`), `ALTER COLUMN … SET NOT NULL` | Add nullable → backfill → enforce NOT NULL later |

Additive/expand operations (`CREATE TABLE`, nullable `ADD COLUMN`, add index) are **not**
flagged. Dropping an index is treated as non-destructive (warn-only at most — decision below).

## Work items

### 1. Detector core · `scripts/check-migration-safety.ts` (+ `.test.ts`)

- **Pure scanner**: `scanSql(statements: string[]) => Finding[]` — classifies each SQL
  statement against the rules above; returns `{ rule, statement, file? }`. No I/O, fully
  unit-tested (repo target ≥90% coverage).
- **Acknowledgment parsing**: a destructive statement is treated as *acknowledged* when its
  migration file contains an explicit marker comment
  (`// migration-safety: acknowledged — <ticket/reason>`). Scanner reports both the finding
  and its acknowledged/unacknowledged status.
- **CLI wrapper**: orchestrates the runtime harness (item 2), prints a human-readable
  report, writes `has_destructive` / `has_unacknowledged` to `$GITHUB_OUTPUT`, and exits
  non-zero when unacknowledged destructive ops exist.

### 2. Runtime harness (Mode B) — capture new migrations' forward SQL

Two-phase apply against the workflow's Postgres service:
1. Check out the **baseline** migrations and `migrate:latest` → reach the pre-change schema.
   - PR context: baseline = the PR's **base branch** (`origin/main`).
   - Deploy context: baseline = the **last-deployed ref** for that environment (see item 5 /
     open decisions).
2. Restore the **head** migrations.
3. `migrate:latest` with a Knex query hook (`knex.on('query', …)` / `DEBUG=knex:query`) →
   this run emits **only the newly-pending migrations' forward SQL**.
4. Feed the captured SQL to `scanSql`.

This naturally scopes to new, forward-only migrations and needs no TS parsing.

### 3. Reusable workflow · `.github/workflows/migration-safety.yml` (`workflow_call`)

- Inputs: `baseline_ref` (default `origin/main`), `pr_number` (optional, for commenting).
- `services: postgres:` for the ephemeral DB.
- Steps: checkout → set up node/knex → run the harness+detector (items 1–2).
- **Outputs**: `has_destructive`, `has_unacknowledged`, `findings` (JSON).
- Called by both the PR workflow and the deploy workflows — single source of truth,
  satisfies "operational in every environment."

### 4. PR-level signal · `.github/workflows/migration-safety-pr.yml`

- Trigger: `pull_request` with `paths: ['db/migrations/**']`.
- Calls the reusable workflow (`baseline_ref: origin/${{ github.base_ref }}`).
- **Sticky comment** with the findings table, using the repo's existing
  `peter-evans/find-comment@v4` + `peter-evans/create-or-update-comment@v5` (match those
  pinned versions per `AGENTS.md`).
- **Required status check**: fails when `has_unacknowledged == true` (destructive + no
  acknowledgment marker / approval), so it blocks merge until signed off.

### 5. Deploy-level gate · `cicd-dev.yml` + `staging-deploy.yml` + `prod-deploy.yml` (done)

- Add a `migration_safety` pre-job that calls the reusable workflow, exposing
  `has_destructive` (report-only: `fail_on_unacknowledged: false` — the PR check enforces).
- **Chosen mechanism: a `trstringer/manual-approval` step** inside each deploy job, gated
  `if: has_destructive == 'true'`, placed right before `terraform apply`. Being a *step*, its
  `if:` makes the pause conditional with **no extra jobs or environments**; it opens an
  approval issue and waits. Approvers come from the `MIGRATION_APPROVERS` repo variable. The
  deploy job `needs: migration_safety` (fail-closed: a failed/skipped scan skips the deploy).
- **Baseline / scanned commit**: dev scans the pushed commit, baseline `github.event.before`.
  Staging/prod deploy a *promoted tag*, so the reusable workflow gained a `ref` input to scan
  the deployed commit; staging baseline = the previous `v*-rc.*` tag, prod baseline = the
  previous plain `vX.Y.Z` tag (both computed in a `migration_baseline` job, falling back to
  `origin/main`).
- **Prod plan-only nuance**: prod's deploy job runs `terraform plan` always but apply/migrate
  only when not plan-only; the approval step mirrors that condition so plan-only previews
  don't pause.
- **Status**: wired for **dev** (`cicd-dev.yml`), **staging** (`staging-deploy.yml`), and
  **prod** (`prod-deploy.yml`).

### 6. Ops setup (not code)

- Set the `MIGRATION_APPROVERS` repo variable to the approver usernames (empty = fail-closed).
- Pin `trstringer/manual-approval` to a full commit SHA (currently `@v1` + `TODO`).
- Confirm the plan supports required reviewers on environments (private repos need
  GitHub Team/Enterprise) — same prerequisite noted for `db-rollback`.

### 7. Docs · `docs/migration-safety.md`

- What's flagged and why (expand-contract), how to write the safe alternative for each rule,
  how to **acknowledge** a deliberate destructive change (the in-file marker), and how the
  **deploy approval** works (who approves, where).

## Testing

- **Unit** (`check-migration-safety.test.ts`): each rule (drop table/column, rename,
  not-null-without-default), the acknowledged vs unacknowledged paths, and safe/additive SQL
  that must **not** trip (create table, nullable add column, add index).
- **Harness fixtures**: a `db/migrations` fixture pair — one destructive, one safe — to
  exercise the two-phase apply end-to-end against the Postgres service.
- **Manual verification**: open a scratch PR adding a `DROP COLUMN` migration → confirm the
  sticky comment appears and the status check fails; add the acknowledgment marker → confirm
  it passes; then confirm the deploy opens the manual-approval issue and waits before apply.

## Risks & open decisions

- **Deploy-context baseline.** The PR diff is vs the base branch; the deploy gate needs
  "migrations new since the last deploy to this env." Recommended: track a per-env deployed
  ref (a git tag like `deployed-<env>` updated on successful deploy, or the previous release
  tag for stg/prod) and diff against it. **Decision needed** on the exact source of truth.
- **`MIGRATION_APPROVERS` must be set** (empty = fail-closed), and `trstringer/manual-approval`
  is a third-party action in the deploy path — pin it to a full commit SHA.
- **Editing an already-applied migration** (modified, not added) is itself unsafe (schema
  drift across envs) — the detector should flag modified migration files separately as a
  warning. **Confirm** we want this.
- **Index drops / other borderline ops** — confirm whether to flag (proposed: warn-only).
- **CI time**: Mode B adds a Postgres spin-up + double `migrate:latest` per run — seconds at
  the current migration count; acceptable, but grows with history.
- **`down()` is intentionally not scanned** — only forward `up()` SQL is captured, which is
  correct (down is expected to be destructive).

## Sequencing / estimate

1. Detector core + unit tests (`scanSql`, acknowledgment) — ~1 day.
2. Runtime harness (two-phase apply + SQL capture) + fixtures — ~1 day.
3. Reusable workflow (`workflow_call` + Postgres service + outputs) — ~0.5 day.
4. PR workflow (comment + required check) — ~0.5 day.
5. Deploy gating across the three workflows + environments setup — ~1 day.
6. Docs + manual end-to-end verification — ~0.5 day.

~**4–4.5 days**. Suggest landing 1–4 first (PR-level detection + visibility, immediately
useful and low-risk), then 5–6 (deploy gating) once the environments are provisioned.
