# Runbooks

Operational runbooks for the payment portal.

## Deploying to Staging and Production

Read in order. The pipeline is the same before and after go-live — what changes
is the discipline around it.

1. [`deploy-pre-golive.md`](deploy-pre-golive.md) — the deploy procedure while the
   app has no live clients. **Start here.**
2. [`deploy-post-golive.md`](deploy-post-golive.md) — the same pipeline once
   clients depend on uptime: change windows, approvals, mandatory verification.
3. [`deploy-rollback.md`](deploy-rollback.md) — how to reverse a deploy safely
   (code rollback is clean; database rollback is not automated).
4. [`deploy-backlog-tickets.md`](deploy-backlog-tickets.md) — improvements still to
   build (automated tests + infrastructure gaps), for the backlog.

## Incidents

- [`lambda-error-alerts.md`](lambda-error-alerts.md) — what to check when a Lambda
  error alert fires.
