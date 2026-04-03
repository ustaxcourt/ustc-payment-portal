# Implementation Plan: initPayment Error Response Coverage

## Goal

Ensure `initPayment` responds to authenticated, authorized, and valid requests with the correct HTTP status codes for all three outcomes:

| Outcome | Expected Status |
|---|---|
| Pay.gov communication failure | 504 Gateway Timeout |
| Unexpected server / database error | 500 Internal Server Error |
| Success | 200 with `token` and `paymentRedirect` |

The 200 path is already covered. The 504 path does not exist yet. The 500 path exists in `handleError` but is not exercised by a handler-level test for `initPayment`.

---

## Current State

### What exists

- `handleError` ([src/handleError.ts](../src/handleError.ts)) returns 500 for any error without a `statusCode < 500`.
- `initPayment` ([src/useCases/initPayment.ts](../src/useCases/initPayment.ts)) wraps the SOAP call in a `try/catch` and re-throws a plain `Error` — no `statusCode` property — so Pay.gov failures currently surface as 500, not 504.
- [src/errors/](../src/errors/) contains `InvalidRequestError` (400), `ForbiddenError` (403), and `ServerError` (500), each carrying a `statusCode` property that `handleError` reads.

### What is missing

1. **`PayGovError` class** — a typed error with `statusCode: 504` to distinguish Pay.gov communication failures from generic server errors.
2. **`initPayment` use case** — the SOAP `catch` block needs to throw `PayGovError` for communication failures, and re-throw DB errors as `ServerError` so the two failure modes produce different HTTP responses.
3. **`handleError`** — needs to pass through `statusCode >= 500` errors (currently it swallows them all into a generic 500). A `PayGovError` with `statusCode: 504` must reach the caller with 504.
4. **Handler-level tests** — `lambdaHandler.test.ts` has no test asserting `initPaymentHandler` returns 500 or 504.

---

## Implementation Steps

### Step 1 — Add `PayGovError`

Create `src/errors/payGovError.ts`:

```ts
export class PayGovError extends Error {
  public statusCode: number = 504;

  constructor(message: string = "Failed to communicate with Pay.gov") {
    super(message);
  }
}
```

Add a matching `src/errors/payGovError.test.ts` following the same pattern as `serverError.test.ts`.

---

### Step 2 — Update `handleError` to pass through all typed errors

The current logic only passes through errors where `statusCode < 500`. Change it to pass through **any** error that has a `statusCode`, regardless of range:

```ts
// Before
if (err.statusCode && err.statusCode < 500) { ... }

// After
if (err.statusCode) { ... }
```

This lets `PayGovError` (504) and `ServerError` (500) surface with their intended codes instead of being collapsed into the generic 500.

Update `handleError.test.ts` to cover the `>= 500` pass-through path (the existing test for `statusCode: 500` currently asserts the generic message — update that assertion to match the new behavior).

---

### Step 3 — Differentiate error types in `initPayment`

The current `catch` block in `initPayment` wraps all errors identically. Split them so that SOAP failures and DB failures throw different typed errors:

```ts
// Pseudocode — not a literal diff
try {
  await TransactionModel.createReceived({ ... });   // DB write

  result = await req.makeSoapRequest(appContext);   // Pay.gov call — throws PayGovError on failure

  await TransactionModel.updateToInitiated(...);    // DB write
} catch (err) {
  await TransactionModel.updateToFailed(agencyTrackingId);

  if (err instanceof PayGovError) {
    throw err;                          // already the right type, propagate as-is
  }
  throw new ServerError(               // DB errors or anything else → 500
    `Failed to initiate payment: ${err instanceof Error ? err.message : String(err)}`
  );
}
```

To distinguish the Pay.gov call from DB calls, extract the SOAP call into its own inner try/catch that throws `PayGovError`, then let DB errors fall through to the outer catch as `ServerError`.

---

### Step 4 — Add handler-level tests

Add two new test cases inside the `initPaymentHandler` describe block in `lambdaHandler.test.ts`:

**504 test** — mock `useCasesMock.initPayment` to reject with a `PayGovError` and assert `statusCode === 504`.

**500 test** — mock `useCasesMock.initPayment` to reject with a plain unexpected `Error` (or a `ServerError`) and assert `statusCode === 500`.

Both tests should use the same valid event shape already established by the 200 test at line 76.

---

### Step 5 — Update use case tests

In `initPayment.test.ts`, update the SOAP failure test (currently at line 123) to assert that the re-thrown error is a `PayGovError` (or carries `statusCode: 504`), not a plain `Error`. Add a second case that simulates a DB failure (mock `createReceived` to reject) and asserts the thrown error is a `ServerError`.

---

### Step 6 — Update OpenAPI registry

In `src/openapi/registry.ts`, add a `504` response entry to the `/init` endpoint definition alongside the existing `500` entry:

```ts
504: {
  description: "Gateway timeout — failed to communicate with Pay.gov",
  content: {
    "text/plain": {
      schema: ServerErrorSchema,   // reuse existing plain-text error schema
    },
  },
},
```

---

## File Change Summary

| File | Change |
|---|---|
| `src/errors/payGovError.ts` | **New** — `PayGovError` with `statusCode: 504` |
| `src/errors/payGovError.test.ts` | **New** — unit tests for `PayGovError` |
| `src/handleError.ts` | **Edit** — pass through all typed errors, not just `< 500` |
| `src/handleError.test.ts` | **Edit** — update 500 assertion to match new pass-through behavior |
| `src/useCases/initPayment.ts` | **Edit** — throw `PayGovError` for SOAP failure, `ServerError` for DB failure |
| `src/useCases/initPayment.test.ts` | **Edit** — assert correct error types for each failure path |
| `src/lambdaHandler.test.ts` | **Edit** — add 504 and 500 test cases for `initPaymentHandler` |
| `src/openapi/registry.ts` | **Edit** — add 504 response to `/init` endpoint |
