# Runbook: Deploying to Staging and Production (AFTER go-live)

**Status: post-go-live.** Client applications — DAWSON and other tax-court
integrators — depend on this service. Predictable uptime is now a requirement, so
every Production change is deliberate, announced, and verified. Before go-live,
use [`deploy-pre-golive.md`](deploy-pre-golive.md) instead.

> The **pipeline is identical** to pre-go-live — build once in Dev, promote the
> same commit SHA forward, never rebuild. What changes after go-live is the
> **discipline around it**: a change window, client notification, a formal
> go/no-go, an approved Prod apply, and explicit post-deploy verification.
> This doc describes only the *deltas*. For the mechanics of each stage and the
> command reference, read the pre-go-live runbook alongside it.

**At go-live, fold pre-go-live in.** This doc references the pre-go-live runbook
for shared mechanics (Stage 1–2 and the command reference). When that file is
retired (per its retire note), pull those referenced sections into this doc first,
then delete pre-go-live so nothing dangles.

---

## What is different after go-live

| Concern | Pre-go-live | **Post-go-live** |
|---------|-------------|------------------|
| Cadence | deploy any time | deploy inside an **agreed change window** |
| Clients | none | **notify client integrators before Prod** |
| Staging→Prod | promote when you're ready | promote only after a **formal go/no-go** |
| Prod apply | review plan, apply | review plan, **`production` Environment reviewer approves** *(reviewer not yet configured — see Stage 4)*, apply |
| Post-deploy | confirm API responds | **mandatory** post-deploy verification + monitoring watch |
| Failure | leave broken, fix forward | follow [`deploy-rollback.md`](deploy-rollback.md); time-bound the decision |

---

## Before you start (post-go-live preconditions)

In addition to the pre-go-live prerequisites (green Dev run + 5 artifacts):

1. **Change window scheduled.** Deploys to Prod happen inside an agreed window,
   not ad hoc. *(Exact window cadence is a team policy — agree it and record it
   here: `<TBD: e.g. business-day mornings, avoid filing deadlines>`.)*
2. **Client integrators notified.** Tell downstream consumers (DAWSON and any
   other integrators) what is deploying and when, before you touch Prod. *(Notify
   via `<TBD: channel / distribution list>`.)*
3. **Migration review (see blocker below).** If the release contains **any**
   database migration, stop and read "Database migrations after go-live" before
   proceeding — there is currently no supported path to migrate Prod.

---

## Stage 1 — Confirm Dev is good

No change from pre-go-live. Verify the Dev run is green and all 5 artifacts exist
for the SHA. See [pre-go-live Stage 1](deploy-pre-golive.md#stage-1--confirm-dev-is-good-no-action-just-verify).

---

## Stage 2 — Deploy to Staging

No change in mechanics — run `staging-deploy.yml`, watch the `/init` smoke-test
gate (200 + `token`/`paymentRedirect` + redirect 302). See
[pre-go-live Stage 2](deploy-pre-golive.md#stage-2--deploy-to-staging).

> Post-go-live emphasis: a red staging smoke test is a **hard stop**. With live
> clients downstream, "promote anyway and watch" is never acceptable.

---

## Stage 3 — Verify Staging + formal go/no-go

Run the full verification from
[pre-go-live Stage 3](deploy-pre-golive.md#stage-3--verify-staging-by-hand):
the integration-suite end-to-end transaction, then confirm the latest transaction is
`transactionStatus = processed` via `getDetails` or `processPayment` CloudWatch
logs (the dashboard is Dev-only).

**Added gate — formal go/no-go.** Verification passing is necessary but not
sufficient. Before promoting, confirm:

- [ ] Integration suite green + transaction confirmed via `getDetails`/logs
- [ ] Change window is open
- [ ] Client integrators have been notified
- [ ] If a migration is involved, the migration plan is resolved (see blocker)
- [ ] Someone owns the deploy and is available to watch it

> **GATE — go/no-go.** All boxes checked, by a named person. Any unchecked box
> is a no-go; reschedule rather than push.

---

## Stage 4 — Promote to Production (with approval + verification)

Mechanics are the same as pre-go-live (final non-pre-release tag on the same SHA
→ `prod-deploy.yml`; `plan_only=true` to preview the plan). Two things are
mandatory after go-live:

1. **Plan, then approve, then apply.** Run with `plan_only=true` first and review
   the Terraform plan. Confirm it only swaps the Lambda artifact keys to your
   verified SHA. The intended authorization gate is a **required reviewer on the
   `production` GitHub Environment** who must approve the run before the apply
   executes.
   > **BLOCKER — the gate is not configured yet.** Verified via the GitHub API:
   > the `production` environment currently has **no protection rules** (no
   > required reviewer). The `environment: production` block in `prod-deploy.yml`
   > is only a label until a reviewer is added. **Configuring a required reviewer
   > on the `production` environment is a prerequisite for this runbook**, tracked
   > in the [deploy backlog](../../deploy-backlog.md). Until then there is no
   > enforced approval gate — a human must self-discipline the plan-review step.
2. **Post-deploy verification is automated and gating.** After a successful
   apply, `prod-deploy.yml` runs a synthetic, read-only `GET /health` check that
   probes Secrets Manager, SSM, RDS, and Pay.gov and fails the job if any check
   is unhealthy. A red gate is a rollback trigger. Still watch by hand:
   - Watch the Lambda error alerts / dashboards for a few minutes — see
     [`lambda-error-alerts.md`](../lambda-error-alerts.md).
   - If anything looks wrong, go to rollback (below) **before** the window
     closes.

> **GATE — verified healthy in Prod.** Apply succeeded **and** post-deploy checks
> are clean. Only then is the deploy "done" and the change window closed.

---

## Database migrations after go-live (BLOCKER — read before any schema change)

**There is currently no supported way to run migrations against Production.**
Staging deploys a `migrationRunner` Lambda and the staging workflow invokes it;
the Prod environment (`terraform/environments/prod/`) defines **no migration
Lambda at all**, and `prod-deploy.yml` neither validates a `migrationRunner`
artifact nor runs migrations.

Consequences and rules:

- **Any release containing a DB migration is blocked from Prod** until a
  supported migration path exists. This must be resolved **before go-live** —
  it is the highest-priority item in the [deploy backlog](../../deploy-backlog.md).
- **Mandate expand-contract (backward-compatible) migrations.** Never ship a
  destructive schema change in the same release as the code that depends on it.
  Add columns/tables in release N (old code ignores them), switch code to use
  them in N+1, remove the old shape in N+2. Each step is independently
  reversible, so a code rollback never strands the schema. This is what keeps
  [`deploy-rollback.md`](deploy-rollback.md) safe.
- Until the Prod migration path is built, **schema-only releases must be planned
  with the team** and applied through whatever mechanism the team agrees on:
  `<TBD: deploy migrationRunner to Prod for parity, or define an approved
  one-off>`.

---

## If a deploy goes wrong

Post-go-live, a bad Prod deploy is an **incident**, not a practice run. Follow
[`deploy-rollback.md`](deploy-rollback.md). The essentials:

- **Code/infra rollback is clean:** re-deploy the previous green tag — every
  release is pinned to its artifacts by SHA, so Terraform converges the Lambdas
  back deterministically.
- **A migration is NOT undone by redeploying old code.** If the release included
  a schema change, do not reflexively roll back — escalate. (Expand-contract
  migrations are mandated precisely so this case stays safe.)
- **Decide quickly.** Roll back within the change window if the deploy isn't
  verifiably healthy; don't let a degraded Prod ride because diagnosis is
  ongoing.

---

## Quick reference

| Stage | Workflow | Trigger | Added post-go-live gate |
|-------|----------|---------|-------------------------|
| Dev | `cicd-dev.yml` | auto on push to `main` | (none) |
| Staging | `staging-deploy.yml` | manual dispatch | smoke test is a hard stop |
| Verify | — | manual | formal go/no-go checklist |
| Prod | `prod-deploy.yml` | Release published / manual | Environment reviewer approval *(reviewer must be configured first)* + required post-deploy verification |

> Items marked `<TBD>` are deliberate placeholders for decisions the team must
> agree on. Replace them with the agreed policy and remove this note.
