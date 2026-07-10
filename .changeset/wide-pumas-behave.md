---
"@ustaxcourt/payment-portal": patch
---

Serialize concurrent `POST /process` requests for the same checkout token so only one Pay.gov SOAP call proceeds; duplicate in-flight requests receive HTTP 409 Conflict.

- Add transient `processing` transaction status and extend `idx_transactions_unique_active` to treat it as in-flight.
- Add `TransactionModel.claimForProcessing` (row lock + atomic claim) and wire it into `processPayment`.
- Document 409 on `POST /process` in OpenAPI; add unit, handler, and integration concurrency tests.
- Fix local Pay.gov test server startup to use `PAY_GOV_TEST_SERVER_ACCESS_TOKEN` so it matches `PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID`.
