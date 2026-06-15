---
"@ustaxcourt/payment-portal": patch
---

Upgrade TypeScript to v6.0.3 and update compiler configuration for TypeScript 6 deprecations.

Remove the deprecated unused `baseUrl` and catch-all `paths` settings, and add `ignoreDeprecations: "6.0"` to preserve the current `moduleResolution: "node"` behavior while acknowledging the TypeScript 6 warning ahead of a future TypeScript 7 migration.
