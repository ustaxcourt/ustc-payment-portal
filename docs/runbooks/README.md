# Runbooks

Operational runbooks for the payment portal. This page is the table of contents —
add a new section here when a new topic is added.

## Deploying to Staging and Production

In [`deploy/`](deploy/). Read in order — the pipeline is the same before and after
go-live; what changes is the discipline around it.

1. [`deploy/deploy-pre-golive.md`](deploy/deploy-pre-golive.md) — the deploy
   procedure while the app has no live clients. **Start here.**
2. [`deploy/deploy-post-golive.md`](deploy/deploy-post-golive.md) — the same
   pipeline once clients depend on uptime: change windows, approvals, mandatory
   verification.
3. [`deploy/deploy-rollback.md`](deploy/deploy-rollback.md) — how to reverse a
   deploy safely (code rollback is clean; database rollback is not automated).

## Incidents

- [`lambda-error-alerts.md`](lambda-error-alerts.md) — what to check when a Lambda
  error alert fires.
