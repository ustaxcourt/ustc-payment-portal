---
"@ustaxcourt/payment-portal": minor
---

Dependency updates for the week of 2026-09-14.

- Raised the supported Node.js floor from `24.19.0` to `24.20.0`. `engines.node`
  is now `>=24.20.0 <25.0.0` and `.nvmrc` pins `24.20.0`, keeping the package
  aligned with DAWSON's Node version. Consumers on `24.19.x` will need to
  upgrade; `24.21.0` was not adopted because DAWSON runs `24.20.0` with
  `engine-strict=true`, which would fail its install.

- Refreshed the npm manifest and lockfile: AWS SDK clients to `3.1135.0`, `jest`
  to `30.5.1`, `zod` to `4.6.5`, `@biomejs/biome` to `2.5.14`, `@playwright/test`
  to `1.63.0`, `@changesets/cli` to `3.0.3`, plus `@smithy/core`, `ts-jest`,
  `tsx`, `fast-xml-parser`, `js-yaml`, and `@asteasolutions/zod-to-openapi`.
- Bumped `@ustaxcourt/ustc-pay-gov-test-server` to `^0.3.0`.
- Upgraded Terraform from `~> 1.15.0` to `~> 1.16.0` across all modules and
  environments, with the CI pin moved from `1.15.9` to `1.16.3`.
- Dropped the inert `@istanbuljs/load-nyc-config` → `js-yaml` override. It
  forced a major over the `^3.13.1` that package declares, guarded a code path
  this repo never executes (no `.nycrc`), and no advisory covers the version it
  falls back to.
- Replaced the deprecated `data.aws_region.current.name` with
  `data.aws_region.current.region` in the `api-gateway` and `rds-proxy` modules,
  which the AWS 6.x provider flags on every plan.
- Added the missing `validateClient` entry to the `api-gateway` module's test
  fixtures, which had been broken since the endpoint was introduced.
