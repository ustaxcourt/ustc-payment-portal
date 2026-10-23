---
"@ustaxcourt/payment-portal": patch
---

Scheduled update for NPM and Terraform dependencies - Week of 2026-10-19

- Bump runtime dependencies to their latest minor/patch versions:
  `dotenv` 18.0.9 and `@aws-sdk/*` 3.1156.0.
- Upgrade `tsup` to 9.0.0 and drop the `tsup` → `esbuild` override, which
  9.0.0 no longer needs. Published JS output is unchanged.
- Pin `.nvmrc` to Node 24.22.1 for the October Node.js security release.
  `engines.node` stays `>=24.20.0 <25.0.0`.
- Move the Terraform CLI to `~> 1.17.0`.
