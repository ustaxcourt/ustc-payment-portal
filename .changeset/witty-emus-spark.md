---
"@ustaxcourt/payment-portal": patch
---

Standardizes logging usage, improves request lifecycle logging, and documents the supported logger patterns.

- Improve `/init` logging coverage for local and hosted execution paths.
- Add request-scoped logger wiring in Lambda `initPaymentHandler` and Express `/init` route.
- Pass request logger into `initPayment` use case and add structured lifecycle logs.
- Log receipt at `debug` level and key request and processing milestones at `info` level.
- Include structured `error` logs for Pay.gov interaction and database persistence failures.
- Use shared logger inside `handleError` and add unit tests to verify logger calls.
- Remove logger dependency injection from `handleError` usage and update tests to mock the shared logger module directly.

- Added missing logger initialization in standalone modules that now use `createLogger()`.
- Updated logger calls in raw Pino contexts to object-first signatures, for example `logger.info({ outputPath }, "message")`.
- Fix a CloudWatch-reported logging crash in `processPayment` by avoiding logging a non-serializable request class instance.
- Update `processPayment` logs to emit safe scalar fields so logger structured-clone sanitization cannot fail at runtime.
- Clarified request-scoped logging guidance to use `appContext.logger` / `getPortalLogger` with context helpers (`clearContext`, `addContext`).
- Updated logging docs to distinguish when to use `createLogger` vs `appContext.logger`, and removed outdated guidance that referenced `createRequestLogger`.
