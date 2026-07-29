# Migration Safety Check (PAY-353)

Flags **destructive / non-backward-compatible** operations in newly-added database
migrations and requires explicit sign-off before they reach a deployment. This protects
zero-downtime deploys and rollback safety: a destructive migration shipped with dependent
code **cannot be rolled back**.

## What it flags

These operations break **expand-contract** (they break existing rows or the currently-running
code), so they require a deliberate decision:

| Flagged | Why | Safe alternative |
|---|---|---|
| Drop table / column | Old code still references it; data is gone | Drop in a later *contract* migration, once no deployed code uses it |
| Rename table / column | Old code references the old name | Add new + backfill + dual-read, drop old a release later |
| Add `NOT NULL` without a default (on an existing table) | Existing rows / old inserts have no value | Add nullable → backfill → enforce `NOT NULL` later |

Additive/expand operations (create table, nullable add column, add index) are **not** flagged.
Only forward (`up`) SQL is analyzed — `down()` is expected to be destructive.

## How it works (runtime SQL capture)

Rather than statically parsing migration TypeScript, the check runs the **new** migrations
against an ephemeral Postgres and scans the **SQL they actually emit** — so it catches
`knex.raw` and any builder chain:

1. Determine migrations added since a baseline ref (`git diff --diff-filter=A`).
2. Move them aside and `migrate:latest` → reach the baseline schema.
3. Restore them and apply each in order, capturing its emitted SQL via a Knex query hook.
4. Classify the SQL ([`src/migrationSafety/scanner.ts`](../src/migrationSafety/scanner.ts)).

Detection logic lives in `scanner.ts` (pure, unit-tested); the I/O harness is
[`src/migrationSafety/checkMigrationSafety.ts`](../src/migrationSafety/checkMigrationSafety.ts).

## Running it locally

```bash
# Against a local Postgres (see docker-compose.yml), diffing against origin/main:
BASELINE_REF=origin/main npm run check:migration-safety
```

Exit code is non-zero when an **unacknowledged** destructive op is found (set
`FAIL_ON_UNACKNOWLEDGED=false` to report only).

## On a PR (AC1)

[`migration-safety-pr.yml`](../.github/workflows/migration-safety-pr.yml) runs on any PR
touching `db/migrations/**`. It:
- posts/updates a **sticky comment** listing findings, and
- **fails** (blocking merge) when a destructive op has no sign-off.

Make the `check` job a **required status check** in branch protection to enforce it.

### Signing off a deliberate destructive change

Destructive changes are sometimes correct (e.g. a planned contract migration). To sign one
off, add a marker comment to the migration file:

```ts
// migration-safety: acknowledged — dropping legacy paygov_token column, PAY-1234
export async function up(knex) { /* ... */ }
```

The PR check then passes (the op is reported as *acknowledged*), and the deploy still pauses
for reviewer approval (below).

## Before deployment (AC2)

When a deploy contains a destructive migration, it **pauses for a human** before
`terraform apply` runs — via the [`trstringer/manual-approval`](https://github.com/trstringer/manual-approval)
action, which opens an approval issue and waits. **Wired into `cicd-dev.yml`,
`staging-deploy.yml`, and `prod-deploy.yml`.**

### Deploy integration pattern (manual-approval step)

The `migration_safety` reusable workflow runs as a report-only pre-job and exposes
`has_destructive`. Inside the deploy job, a single **approval step** — gated on that output —
runs right before `terraform apply`. Because it's a *step*, its `if:` makes the pause
conditional with no extra jobs or environments; on the safe path the step is simply skipped.

```yaml
jobs:
  # Report-only scan (the PR check enforces sign-off); output drives the approval step.
  migration_safety:
    uses: ./.github/workflows/migration-safety.yml
    with:
      baseline_ref: ${{ github.event.before || 'origin/main' }}  # dev: main tip before this push
      fail_on_unacknowledged: false

  deploy_dev:
    needs: [migration_safety]        # fail-closed: a failed/skipped scan skips the deploy
    permissions:
      issues: write                  # the action opens an approval issue
    steps:
      # ... checkout, creds, terraform plan ...
      - name: Manual approval for destructive migration
        if: needs.migration_safety.outputs.has_destructive == 'true'
        uses: trstringer/manual-approval@<sha>   # pinned to a full commit SHA (v1.13.1)
        with:
          secret: ${{ github.token }}
          approvers: ${{ vars.MIGRATION_APPROVERS }}
          minimum-approvals: 1
      # ... terraform apply + `aws lambda invoke '{"command":"migrate"}'` ...
```

The approval sits **before `terraform apply`**, so nothing is applied or migrated until a
reviewer approves the issue. On the safe path the step is skipped and the deploy runs
unattended. **prod** additionally gates the step on the apply-vs-plan-only condition, so a
plan-only preview never pauses.

> **Third-party action.** `trstringer/manual-approval` is a community action, not a GitHub- or
> Atlassian-provided one — it runs in the deploy path, so it's pinned to a **full commit SHA**
> (`fa64294…`, v1.13.1). Re-review the action before bumping the pin.

### Baseline (and the commit scanned) per environment

Staging/prod deploy a *promoted tag*, not the triggering ref, so the scan must check out the
deployed commit. The reusable workflow takes a `ref` input for that (defaults to the
triggering ref, which is correct for dev/PR).

- **dev** (`cicd-dev.yml`, deploys on push to main): `ref` defaults to the pushed commit;
  baseline = `github.event.before` (the main tip before this merge).
- **staging** (`staging-deploy.yml`, deploys a promoted dev tag): `ref` = the promoted
  commit (`needs.promote.outputs.sha`); baseline = the previous `v*-rc.*` tag before that
  commit (computed in the `migration_baseline` job). If none is found (e.g. first-ever
  staging deploy) it falls back to `origin/main`, which scopes to nothing new. This
  **fail-open** fallback is intentional: the PR check already enforced sign-off, so only the
  *secondary* deploy pause is skipped on that rare edge (first deploy / lookup failure).
- **prod** (`prod-deploy.yml`, deploys a release tag): `ref` = the release commit; baseline =
  the previous plain `vX.Y.Z` tag (no `-dev`/`-rc` suffix), same fallback as staging. The
  approval step fires **only on runs that will actually apply/migrate** — plan-only previews
  are not paused (it mirrors the migrate step's own condition).

> **Caveat — scanning old promoted tags.** Because the scan checks out the deployed commit
> (`ref`), the detector and the `check:migration-safety` npm script also come from that commit.
> Promoting a tag cut **before PAY-353 existed** has no such script, so the scan step
> hard-fails and the deploy is **blocked (fail-closed)**. This only affects re-deploying a
> stale, pre-PAY-353 tag; every tag cut after this landed includes the detector, so the normal
> forward flow is unaffected. If you must deploy such a tag, re-cut it from current `main` (or
> temporarily bypass the gate) rather than working around the check.

## One-time setup (ops)

- Add the PR `check` job as a **required status check** in branch protection.
- Set the **`MIGRATION_APPROVERS`** repo variable (Settings → Secrets and variables → Actions
  → Variables) to a comma/newline-separated list of GitHub usernames who may approve. They
  must have repo access. Individual usernames are simplest; team approvers require the token to
  resolve team membership. **If this variable is empty the approval step fails closed** (the
  deploy stops), so set it before the first destructive-migration deploy.
- `trstringer/manual-approval` is pinned to a **full commit SHA** (`fa64294…`, v1.13.1) — done.
- The deploy jobs already grant `issues: write` (the action opens the approval issue) — no
  action needed, just noted.

## Extending the rules

Add a pattern to `scanSql` in [`scanner.ts`](../src/migrationSafety/scanner.ts) and a case
to its test — the runtime harness and workflows need no changes.
