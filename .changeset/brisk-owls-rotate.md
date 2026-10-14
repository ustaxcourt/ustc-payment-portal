---
"@ustaxcourt/payment-portal": patch
---

Scheduled update for NPM and Terraform dependencies - Week of 2026-10-12

- Bump runtime dependencies to their latest minor/patch versions, including
  `express` 5.3.0, `dotenv` 18.0.7, and `@aws-sdk/*` 3.1151.0.
- Pin `objection` to `~3.1.5`. Its 3.2–3.9 releases come from a new fork
  line; see `docs/dependency-caveats.md`.
- Refresh the Terraform provider lockfiles to `hashicorp/aws` 6.68.0.
