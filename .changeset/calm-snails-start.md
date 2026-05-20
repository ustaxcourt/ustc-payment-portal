---
"@ustaxcourt/payment-portal": patch
---

PAY-310: `GetRequestRequest` now branches on the SOAP envelope before parsing.
A success envelope is Zod-validated against `PayGovGetDetailsResponseSchema`
(throws `ZodError` on contract drift); any other envelope shape is routed
through `handleFault` and throws `FailedTransactionError` carrying Pay.gov's
`return_code` / `return_detail` for on-call diagnosis. Behavior at the public
API is unchanged — `getDetails` continues to coerce all entity-layer failures
to `PayGovError(500)` per PAY-306. Internal-only refactor: the duplicate
`TransactionDetails` type was removed in favor of the schema-inferred
`PayGovGetDetailsTransaction`.
