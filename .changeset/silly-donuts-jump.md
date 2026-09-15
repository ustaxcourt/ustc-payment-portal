---
"@ustaxcourt/payment-portal": patch
---

- Removed npm `overrides` entries that are no longer needed: `read-yaml-file` (orphaned — nothing in the dependency tree requires it), the six `@opentelemetry/exporter-*` pins (the vulnerable pinner, `artillery-plugin-publish-metrics`, is no longer in the tree; `artillery` now declares a safe range directly), and `ejs`/`glob` (their parent packages, `@oclif/core` and `jest`, now declare safe ranges directly). No functional or runtime change — `npm audit` remains clean.
- General minor and patch updates from running `npm update`.
- GHSA-8cw4-87c7-c6xx — csv-parse@<7.0.2 (moderate) vulnerability accepted for now in `dependency-caveats.md`, we don't currently use the CSV payload file feature of Artillery (the parent package that uses csv-parse).
- `Changelogs` schema update to `v4.0.0`.
- Bumps `@ustaxcourt/ustc-pay-gov-test-server` to `0.3.0`.
