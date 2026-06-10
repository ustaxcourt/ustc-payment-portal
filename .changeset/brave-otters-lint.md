---
"@ustaxcourt/payment-portal": patch
---

PAY-324: Adopt Biome as the linter and remove deprecated TSLint.

TSLint (deprecated since 2019) is removed entirely — the `tslint` dependency and `tslint.json` are gone. Biome now performs linting via `biome.json` (recommended ruleset; formatter disabled — formatting is deferred to PAY-319) and respects `.gitignore` through its VCS integration.

Linting runs in warning-only mode for now: pre-existing violations surface as warnings rather than build-breaking errors, so adoption isn't blocked on the existing backlog (to be addressed in follow-up tickets). CI runs `lint:ci` (`biome lint --reporter=github`) so warnings render as inline PR annotations.

The type-aware `noFloatingPromises` rule is enabled (as a warning) to guard against unhandled async failures — relevant for a Pay.gov/Lambda service. The current codebase has zero violations; the rule prevents regressions going forward.

Tooling only — no runtime or public API changes.

See [ADR 0008](docs/architecture/decisions/0008-Linting-And-Formatting-Decision.md).
