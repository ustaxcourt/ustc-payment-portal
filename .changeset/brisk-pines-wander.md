---
"@ustaxcourt/payment-portal": patch
---

Weekly dependency maintenance updates (week of 2026-11-09).

- Update AWS SDK packages:
  - `@aws-sdk/client-lambda` `^3.1162.0` → `^3.1165.0`
  - `@aws-sdk/client-secrets-manager` `^3.1162.0` → `^3.1165.0`
  - `@aws-sdk/client-ssm` `^3.1162.0` → `^3.1165.0`
  - `@aws-sdk/client-sts` `^3.1162.0` → `^3.1165.0`
- Update supporting libraries:
  - `dotenv` `^18.0.9` → `^18.0.10`
  - `@smithy/core` `^3.39.0` → `^3.40.0`
- Update development tooling:
  - `@biomejs/biome` `^2.6.5` → `^2.6.6`
  - `@playwright/test` `^1.64.1` → `^1.65.0`
  - `jest` `^30.5.1` → `^30.5.2`
- Refresh the lock file's in-range transitive updates.

No vulnerability was fixed through a direct dependency; `npm audit --omit=dev` reports 0. No application behavior changes were made.
