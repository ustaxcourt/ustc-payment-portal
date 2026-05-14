---
"@ustaxcourt/payment-portal": patch
---

## What Changed?

### GetDetails Use Case
Previously, when the Pay.gov refresh inside `getDetails` failed for any of three reasons — schema validation (ZodError), SOAP/network error, or a DB write rejection — the failure was logged and stale data was returned. The transaction stayed stuck in its non-terminal state indefinitely.

The use case now mirrors the `initPayment` pattern from PAY-305:
- **SOAP/Zod/parse failure on the refresh:** mark the row as `failed` via `updateToFailed`, then throw `PayGovError(500)` encouraging a retry.
- **DB failure on `updateAfterPayGovResponse`:** mark the row as `failed`, then throw `PayGovError(500)`.
- If `updateToFailed` itself rejects, the secondary failure is logged so the original cause is not masked.
- `returnCode` is left undefined for these failures (it is Pay.gov-namespaced); the human-readable cause goes in `returnDetail`.

### GetDetailsRequest entity
- Added Zod validation of the Pay.gov response shape against `PayGovGetDetailsResponseSchema`.
- The previous bare `Error("Could not find any transaction details")` is replaced by schema rejection (empty `transactions` array fails `.nonempty()`).
- `TransactionDetails.transaction_amount` corrected from `string` to `number` to match what the XML parser actually produces.
- Removed the `console.log("getDetails api response", response)` debug line on the success path. The schema-failure path retains a structured `console.error` with the raw response for on-call diagnosis; the success-path log was untyped noise.

### PayGovError
- `statusCode` is now an optional constructor argument (default `504`, preserving existing `initPayment` behavior). `getDetails` passes `500` per acceptance criteria.

### Schemas
- New `PayGovGetDetailsResponse.schema.ts` (Pay.gov inbound SOAP response — distinct from the existing outbound `GetDetails.schema.ts`).

### Testing
- `getDetails.test.ts` failure-path tests rewritten — they previously asserted the bug ("logs and continues"); they now assert the correct fail-fast contract, including the multi-row partial-write-then-throw case.
- `GetDetailsRequest.test.ts` extended with ZodError cases and migrated to `jest.spyOn` + `restoreAllMocks`.
- `payGovError.test.ts` and `handleError.test.ts` extended for the configurable statusCode.
