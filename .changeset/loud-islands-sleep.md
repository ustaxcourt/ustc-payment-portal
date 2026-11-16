---
"@ustaxcourt/payment-portal": patch
---

Deploy the Case Services & Finance dashboard endpoints to `Stg` and wire them for `Prod` (PAY-503).

- `Stg` now serves the two SigV4 endpoints the dashboard calls,
  `GET /transaction-log` and `GET /revenue-summary`, backed by the
  `getTransactionLog` and `getRevenueSummary` Lambdas.
- `Prod` is wired the same way (Lambdas, artifacts, routes) but remains offline.
- The two routes are no longer gated per environment in the API Gateway module.
  `moved` blocks keep existing `dev` and `pr-*` state in place; remove them after
  the next apply in those environments.
- Their Lambda invoke permissions are now scoped with `source_arn` to this API's
  routes.
- `staging-deploy.yml` and `prod-deploy.yml` check for and pass the two new
  artifacts. The staging deploy also validates the `cancelExpired` artifact and
  smoke-tests that unsigned requests are rejected.
- No application code or public API changes.
