---
"@ustaxcourt/payment-portal": patch
---

Standardizes logging usage and documents the supported logger patterns.

- Added missing logger initialization in standalone modules that now use `createLogger()`.
- Updated logger calls in raw Pino contexts to object-first signatures, for example `logger.info({ outputPath }, "message")`.
- Clarified request-scoped logging guidance to use `appContext.logger` / `getPortalLogger` with context helpers (`clearContext`, `addContext`).
- Updated logging docs to distinguish when to use `createLogger` vs `appContext.logger`, and removed outdated guidance that referenced `createRequestLogger`.
