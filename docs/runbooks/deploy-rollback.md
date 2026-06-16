# Runbook: Rollback Strategy

How to reverse a deploy that went wrong. Read this alongside the deploy
runbooks ([pre-go-live](deploy-pre-golive.md) /
[post-go-live](deploy-post-golive.md)) — they link here from their "if a gate
fails" sections.

> **The one principle:** rollback is **two independent problems** that people
> conflate — **code/infra** and **database schema**. Code rollback is clean and
> deterministic here. Database rollback is **not automated in any deployed
> environment**. Treat them separately, and never assume undoing one undoes the
> other.

---

## Axis A — Code / infrastructure rollback (clean)

Because every environment is pinned to a **Dev-built artifact by commit SHA**
(see the deploy runbooks), "roll back the code" means "deploy the previous green
tag." Terraform converges the Lambdas back to that tag's artifact set
deterministically — there is no rebuild and no ambiguity about what is running.

**Production** — re-deploy the last known-good tag, plan first, then apply (review
the plan, then publish that tag's Release or re-dispatch with `plan_only=false`):

```bash
gh workflow run prod-deploy.yml -f release_tag=<previous-good-vX.Y.Z> -f plan_only=true
```

**Staging:** re-run `staging-deploy.yml` selecting the previous good dev tag
(`source_dev_tag`), exactly as in a normal promotion.

This axis is a genuine strength of the pipeline: a code/infra rollback is just
"promote the previous tag," not a scramble.

---

## Axis B — Database / migration rollback (NOT automated — read carefully)

**There is no automated migration-rollback path in any deployed environment.**
Verified against the code:

- The `migrationRunner` Lambda (`src/migrationHandler.ts`) supports `migrate`,
  `seed`, `verify`, and DB/role admin commands — **but no `rollback`/`down`
  command.** `migrate` only runs `knex.migrate.latest()`, which is **forward
  only.**
- `package.json` has `migrate:rollback` / `migrate:down`, but those run Knex
  against a **directly reachable** database. Staging/Prod RDS live inside the
  VPC, so these are not a deployed rollback mechanism.
- **Prod has no migration Lambda at all** (`terraform/environments/prod/`
  defines none).

Consequences:

1. **Redeploying old code does NOT undo a migration.** If release N added or
   changed schema and you roll code back to N-1, the schema change remains. Old
   code against the new schema can break **worse** than the bug you were
   escaping.
2. **A migration cannot be reversed by the pipeline.** Reversing one requires a
   **new forward migration** (a "contract" step) shipped through the normal
   flow, or manual DBA intervention against the RDS instance — both slow,
   neither is a one-click rollback.

### Therefore: expand-contract migrations are MANDATORY

Because there is no automated down-migration, the only way to keep code rollback
safe is to ensure the **new schema always satisfies the old code**. Use
backward-compatible, multi-step (expand-contract) migrations:

- **Release N (expand):** add the new column/table. Old code ignores it; new
  code does not yet require it.
- **Release N+1 (migrate):** switch code to read/write the new shape.
- **Release N+2 (contract):** remove the old shape, only once nothing uses it.

Each step is independently reversible **by redeploying the previous tag**,
because no single release both adds a schema dependency and removes the old path.
**Never ship a destructive schema change in the same release as the code that
depends on it.** (The repo already trends this way — see
`db/migrations/` for additive `add_*`/`expand_*` migrations.)

---

## Decision tree — what failed, where, what to do

| Where it failed | Did anything reach a live env? | Action |
|-----------------|-------------------------------|--------|
| Dev / Staging gate (smoke, Cypress, `getDetails`) | No (Staging only, no live clients pre-go-live) | Fix forward; re-run from Dev. No rollback needed. |
| Prod `terraform plan` looks wrong | No | Don't apply. Investigate the plan. |
| Prod `terraform apply` errored mid-run, **no migration in release** | Partially | Re-deploy previous good tag (Axis A). |
| Prod healthy-check failed after apply, **no migration** | Yes | Re-deploy previous good tag (Axis A). |
| **Any failure where the release included a migration** | Maybe | **Do NOT reflexively roll back code.** Escalate — Axis A will not fix the schema. Decide forward-fix vs. manual DB action with the team. |

---

## Post-go-live specifics

- **Decide quickly, inside the change window.** If a Prod deploy is not
  verifiably healthy, roll back (Axis A) rather than letting a degraded Prod ride
  while diagnosis continues.
- **Authority:** the person who owns the deploy (per the
  [post-go-live runbook](deploy-post-golive.md)) calls the rollback. Prod is a
  separate AWS account and a human owns every apply.
- **Notify client integrators** of a rollback the same way you notified them of
  the deploy.

---

## Known gaps (tracked in the [deploy backlog](deploy-backlog-tickets.md))

- **No automated DB migration rollback** in deployed environments — reversal is
  manual or forward-only today. A supported down-migration path (or a documented
  manual RDS procedure) is a backlog item, tied to building the Prod migration
  path.
- **No automated Prod post-deploy verification** (smoke test commented out), so
  detecting that a rollback is *needed* currently relies on manual checks /
  alerts — see [`lambda-error-alerts.md`](lambda-error-alerts.md).
