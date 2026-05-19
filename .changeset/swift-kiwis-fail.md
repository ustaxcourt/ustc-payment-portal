---
"@ustaxcourt/payment-portal": patch
---

## What Changed?

### GetDetails Use Case
Previously, when the Pay.gov refresh inside `getDetails` failed for any of three reasons — schema validation (ZodError), SOAP/network error, or a DB write rejection — the failure was silently logged and stale data was returned to the client.

`getDetails` is a read; a refresh failure means our source of truth is temporarily unreachable, not that the underlying transaction failed. The use case now:
- **SOAP/Zod/parse failure on the refresh:** throw `PayGovError(500)` with a retry-encouraging message. The row's state is left untouched — it stays `pending` until Pay.gov is reachable and we can confirm a definitive status.
- **DB failure on `updateAfterPayGovResponse`:** same — throw `PayGovError(500)`. We had a fresh Pay.gov status but couldn't persist it; the next call will re-fetch and re-persist.

We deliberately do **not** call `updateToFailed` here: marking a `pending` row as `failed` because Pay.gov is briefly unreachable would conflate "we don't know" with "it failed," and a real success would become a false failure once Pay.gov came back online.

### GetDetailsRequest entity
- Added Zod validation of the Pay.gov response shape against `PayGovGetDetailsResponseSchema`.
- The previous bare `Error("Could not find any transaction details")` is replaced by schema rejection (empty `transactions` array fails `.nonempty()`).
- `TransactionDetails.transaction_amount` corrected from `string` to `number` to match what the XML parser actually produces.
- Removed the `console.log("getDetails api response", response)` debug line on the success path. The schema-failure path retains a structured `console.error` with the raw response for on-call diagnosis; the success-path log was untyped noise.

### PayGovError
- `statusCode` is now an optional constructor argument (default `504`, preserving existing `initPayment` behavior). `getDetails` passes `500` per acceptance criteria.

### Schemas
- New `PayGovGetDetailsResponse.schema.ts` (Pay.gov inbound SOAP response — distinct from the existing outbound `GetDetails.schema.ts`).
- The schema validates only the two fields the use case actually consumes (`paygov_tracking_id`, `transaction_status`); `agency_tracking_id`, `transaction_amount`, and the date/payment_type fields are optional. The dev Pay.gov fake omits some of the strict-required fields the original schema specified, and we don't read those fields downstream anyway — the DB row already has them.

### Testing
- `getDetails.test.ts` failure-path tests rewritten — they previously asserted the bug ("logs and continues"); they now assert the correct fail-fast contract, including the multi-row partial-write-then-throw case.
- `GetDetailsRequest.test.ts` extended with ZodError cases and migrated to `jest.spyOn` + `restoreAllMocks`.
- `payGovError.test.ts` and `handleError.test.ts` extended for the configurable statusCode.
