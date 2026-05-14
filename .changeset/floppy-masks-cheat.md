---
"@ustaxcourt/payment-portal": patch
---

## What Changed?

### `processPayment` Error Handling

Refactored `processPayment.ts` to split the original single `try/catch` into two sequential blocks, making the failure mode unambiguous:

- **First `try`** wraps `req.makeSoapRequest`. On failure:
  - `FailedTransactionError` — existing path preserved: `updateToFailed` with Pay.gov's code/detail, return `paymentStatus: "failed"`.
  - `ZodError` — Pay.gov returned a body that failed schema validation: `safeUpdateToFailed` + throw `PayGovError` (504). Previously this reached `handleError`'s `ZodError → 400` branch, incorrectly blaming the client.
  - Anything else (network, parse, etc.) — `safeUpdateToFailed` + throw `PayGovError` (504) with a retry-encouraging message.
- **Second `try`** wraps `TransactionModel.updateAfterPayGovResponse`. On failure: `safeUpdateToFailed` + throw `ServerError` (500), since the DB is our infrastructure, not Pay.gov's.

Also reordered `ZodError` and `PayGovError` branches in `handleError.ts` so that Pay.gov-originated `PayGovError`s are matched before the generic `ZodError → 400` branch, preserving correct 400 behavior for request-body validation while ensuring Pay.gov faults yield 504.

### `safeUpdateToFailed` Utility (`src/utils/safeUpdateToFailed.ts`)
**instead of writing a identical try-catch calling `updateToFailed`, anywhere we need to mark the row as failed just use `safeUpdateToFailed`.**
Extracted a new shared helper that wraps `TransactionModel.updateToFailed`, logs any DB error from the recovery attempt, and returns `void`. This prevents a failure-in-recovery from masking the primary error thrown to the caller. The helper is now used in both `processPayment` and `initPayment`.

### `initPayment` Refactor

Replaced two inline `.catch((dbErr) => console.error(...))` patterns (after `makeSoapRequest` failure and after `updateToInitiated` failure) with `await safeUpdateToFailed(...)`. Behavior is identical; the refactor ensures the recovery pattern is shared and consistent across use cases.

---

## Testing

- **`src/utils/safeUpdateToFailed.test.ts`** (new): covers the happy path, swallowing of rejections without throwing, and logging of the `agencyTrackingId` + error on failure.
- **`src/useCases/processPayment.test.ts`** (updated): added unit tests for ZodError from Pay.gov response validation, network failure from `makeSoapRequest`, and DB write failure in `updateAfterPayGovResponse`. Tests assert both the error type/code returned to the caller and that `updateToFailed` is called (or not called) as expected.
