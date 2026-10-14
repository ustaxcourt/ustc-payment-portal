---
"@ustaxcourt/payment-portal": patch
---

Scheduled update for NPM and Terraform dependencies - Week of 2026-10-12

- Bump `@ustaxcourt/ustc-pay-gov-test-server` from `^0.3.0` to `^0.4.0`. 0.3.0
  shipped `nodemon` as a runtime dependency, which pulled the `braces` advisory
  (GHSA-vfj7-8cjw-p6xm, high) into every consumer install. 0.4.0 skips the
  access-token check when `APP_ENV=local`, which `ustc-payment-portal` already
  sets by default.
- Refresh `package-lock.json` to clear critical advisories in `shell-quote`
  (via `npm-run-all2`) and `handlebars`, and the high advisory in
  `http-cache-semantics`.
- Bump runtime dependencies to their latest minor/patch versions, including
  `objection` 3.9.1, `pino` 10.4.0, `express` 5.3.0, `dotenv` 18.0.7, and
  `@aws-sdk/*` 3.1151.0.
- Refresh the Terraform provider lockfiles to `hashicorp/aws` 6.68.0.
