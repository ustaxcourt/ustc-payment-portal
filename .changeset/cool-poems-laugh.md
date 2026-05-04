---
"@ustaxcourt/payment-portal": patch
---

Improve `/init` logging coverage for local and hosted execution paths.

- Add request-scoped logger wiring in Lambda `initPaymentHandler` and Express `/init` route.
- Pass request logger into `initPayment` use case and add structured lifecycle logs.
- Log receipt at `debug` level and key request/processing milestones at `info` level.
- Include structured `error` logs for Pay.gov interaction and database persistence failures.
- Use shared logger inside `handleError` and add unit tests to verify logger calls.
