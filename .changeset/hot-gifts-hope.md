---
"@ustaxcourt/payment-portal": patch
---

- Updated FK constraint for `fee_id` as NOT VALID so Postgres skips the historical row check (fees table is empty at migration time; 01_reference_data seeds it after);
- inlined known fee amounts in the transaction_amount backfill for the same reason.

- Validate **POST** `/process` requests — tighten ProcessPaymentRequestSchema with `.strict()` (reject unknown fields) and `.min(1)` (reject empty token strings), matching the pattern already established for /init.
- Standardize error responses — handleError now returns a consistent { message, errors } JSON envelope for all error types (Zod validation, InvalidRequestError, PayGovError, and generic 500s), replacing the previous mix of plain text and JSON
- Extract shared parseAndValidate helper in `lambdaHandler.ts` — both initPaymentHandler and processPaymentHandler now use the same JSON-parse + Zod-validation pipeline with a discriminated union return type (ParseResult<T>) for proper type narrowing (eliminates non-null assertions)

- Align OpenAPI docs — added `ValidationErrorResponseSchema` and `GatewayErrorSchema`; updated `/process` 400 response from text/plain to application/json and added 504 response using `GatewayErrorSchema` to match what the API actually returns; regenerated openapi.json and openapi.yaml

- Comprehensive test coverage — unit tests cover missing body, empty body, malformed JSON, missing token, wrong type, empty token, too-short token, unknown fields (with unrecognized_keys assertion), PayGovError propagation, and generic 500; integration tests cover malformed JSON, missing token, and unknown fields against the deployed endpoint
