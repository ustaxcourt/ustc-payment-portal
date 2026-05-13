# PAY-294: ProcessPayment — Handling 'Failed' transactions due to fault errors from Pay.gov

## Overview

In [src/useCases/processPayment.ts](src/useCases/processPayment.ts) the `try` block currently has a single `catch` branch:

```ts
} catch (err) {
  if (err instanceof FailedTransactionError) {
    await TransactionModel.updateToFailed(...);
    return { paymentStatus: "failed", transactions: [...] };
  } else throw err;
}
```

Anything that is *not* a `FailedTransactionError` (a Pay.gov-side decline) is re-thrown as-is. Three real failure modes hit that `else throw err` path today:

1. **Zod validation failure** — Pay.gov returns a 2xx SOAP body that does not match [CompleteOnlineCollectionWithDetailsResponseSchema](src/schemas/CompleteOnlineCollectionWithDetailsResponse.schema.ts). [CompleteOnlineCollectionWithDetailsRequest.ts:49](src/entities/CompleteOnlineCollectionWithDetailsRequest.ts#L49) calls `throw parsed.error` (a `ZodError`).
2. **DB write failure** — `TransactionModel.updateAfterPayGovResponse` ([db/TransactionModel.ts:161](src/db/TransactionModel.ts#L161)) throws (connection drop, constraint violation, etc.) *after* Pay.gov has responded with a real result.
3. **Network/parse failure inside `makeSoapRequest`** — `appContext.postHttpRequest` throws or the response cannot be parsed as XML ([SoapRequest.ts:65](src/entities/SoapRequest.ts#L65)).

In every one of these cases:

- The `transactions` row stays at `transactionStatus = 'initiated'` forever (no `updateToFailed` call), so the record requires manual recovery.
- The error bubbles to [handleError.ts](src/handleError.ts), which maps `ZodError → 400` and everything else → `500 "An unexpected error occurred…"`. Neither is correct: the 400 implies *client* input was invalid (it wasn't — the malformed payload came from Pay.gov), and the generic 500 gives no signal to the caller about whether retrying is safe.

The ticket's user story is: **as a developer, I need malformed/down Pay.gov responses to (a) return a 500 with a clear retry-encouraging message and (b) mark the DB row failed so the obligation isn't stuck in `initiated`.**

### Acceptance Criteria (from PAY-294)

- [ ] Throw `500` for Zod validation error with appropriate message — via `payGovError.ts`
- [ ] Throw `500` for DB error from `updateAfterPayGovResponse` with appropriate message
- [ ] Throw `500` for error from `makeSoapRequest` with appropriate message — via `payGovError.ts`
- [ ] Message to client should encourage retrying the call
- [ ] Mark the failure on the transaction record in the DB

---

## Current State Audit

| Area | File | Notes |
|---|---|---|
| Use case | [src/useCases/processPayment.ts](src/useCases/processPayment.ts) | Single `catch` that only handles `FailedTransactionError`. Everything else re-thrown. |
| Pay.gov error class | [src/errors/payGovError.ts](src/errors/payGovError.ts) | Currently `statusCode = 504`. The ticket asks for `500`. |
| Pay.gov error tests | [src/errors/payGovError.test.ts](src/errors/payGovError.test.ts) | Asserts `statusCode === 504`. Will need to be updated. |
| Top-level handler | [src/handleError.ts](src/handleError.ts) | Maps `ZodError → 400`, has a `PayGovError` branch using `err.statusCode`. |
| SOAP entry point | [src/entities/CompleteOnlineCollectionWithDetailsRequest.ts](src/entities/CompleteOnlineCollectionWithDetailsRequest.ts) | Throws raw `parsed.error` (ZodError) on schema mismatch. |
| DB layer | [src/db/TransactionModel.ts:161](src/db/TransactionModel.ts#L161) | `updateAfterPayGovResponse` and `updateToFailed` both throw on knex errors. |
| Existing tests | [src/useCases/processPayment.test.ts](src/useCases/processPayment.test.ts) | Has success / `FailedTransactionError` / fault-without-detail coverage. No coverage for Zod failure, DB write failure, or network failure. |

### Important nuance: ZodError mapping

`handleError` currently checks `err instanceof ZodError` *before* `err instanceof PayGovError`. That branch returns `400`, which is correct for client-input validation (e.g. request body parsing) but **wrong** for Pay.gov response validation. Two ways to fix:

1. **Translate at the source** — convert the `ZodError` into a `PayGovError` inside the SOAP entity (or inside `processPayment`'s catch) so it never reaches the `ZodError` branch in `handleError`. *Preferred*: keeps `handleError` semantics intact and matches the ticket's note ("via `payGovError.ts`").
2. **Reorder branches** — let `ZodError` continue propagating and add a branch in `handleError` that distinguishes Pay.gov-origin ZodErrors. Fragile and couples the global handler to upstream call sites.

We will go with (1).

---

## Design

### 1. Repurpose `PayGovError` as the 500-class wrapper

Change [src/errors/payGovError.ts](src/errors/payGovError.ts) `statusCode` from `504` → `500`. The ticket explicitly says "throw 500 … `payGovError.ts`", so this class becomes the single carrier for "we couldn't talk to Pay.gov or couldn't make sense of what it said."

Default message becomes retry-encouraging, e.g.:

```
"We could not complete this transaction with Pay.gov. Please retry the request."
```

Keep the optional `message` constructor arg so call sites can pass more specific copy when useful (without leaking internal details).

### 2. Catch three explicit categories in `processPayment`

Replace the current single `if (err instanceof FailedTransactionError) … else throw err` block with a structured handler that:

1. Keeps the existing `FailedTransactionError` branch intact (Pay.gov *successfully* told us the transaction failed → `updateToFailed` → return `paymentStatus: "failed"`).
2. Adds branches for each of the three failure modes the ticket calls out:
   - `ZodError` → DB row marked failed → throw `PayGovError`.
   - DB error from `updateAfterPayGovResponse` → DB row already in `initiated`; best-effort `updateToFailed` → throw `PayGovError`.
   - Any other error originating from `makeSoapRequest` → DB row marked failed → throw `PayGovError`.

The simplest way to keep the DB-write-failure branch distinguishable is to split the inner work: do the `makeSoapRequest` + schema parsing inside one `try`, and do the `updateAfterPayGovResponse` call inside a second `try`. Otherwise we can't tell from inside `catch` whether the failure happened *before* or *after* we got a valid response from Pay.gov.

Sketch (final wording lives in the implementation):

```ts
let result: CompleteOnlineCollectionWithDetailsResponse;
try {
  result = await req.makeSoapRequest(appContext);
} catch (err) {
  if (err instanceof FailedTransactionError) {
    // existing path — Pay.gov returned a SOAP Fault we understood
    await TransactionModel.updateToFailed(transaction.agencyTrackingId, err.code, err.message);
    return { paymentStatus: "failed", transactions: await loadSummaries() };
  }
  if (err instanceof ZodError) {
    await safeUpdateToFailed(transaction.agencyTrackingId, undefined, "Pay.gov returned a response that failed schema validation");
    throw new PayGovError(); // default retry message
  }
  // Network/parse/other failures from makeSoapRequest
  await safeUpdateToFailed(transaction.agencyTrackingId, undefined, "Error communicating with Pay.gov");
  throw new PayGovError();
}

const parsedStatus = parseTransactionStatus(result.transaction_status);
const paymentStatus = derivePaymentStatusFromSingleTransaction(parsedStatus);

try {
  await TransactionModel.updateAfterPayGovResponse(
    transaction.agencyTrackingId,
    result.paygov_tracking_id,
    parsedStatus,
    paymentStatus,
    toPaymentMethod(result.payment_type),
    result.transaction_date,
    result.payment_date,
  );
} catch (err) {
  // Pay.gov accepted the payment; our DB write failed. Best-effort mark failed so the row isn't stuck.
  await safeUpdateToFailed(transaction.agencyTrackingId, undefined, "Failed to persist Pay.gov response");
  throw new PayGovError();
}
```

`safeUpdateToFailed` is a tiny inline helper that swallows DB errors and logs — if marking failed *also* fails, we still need to throw the original `PayGovError` to the client rather than crashing on the recovery step.

### 3. `handleError` mapping

With `PayGovError.statusCode = 500` the existing branch in [src/handleError.ts](src/handleError.ts) already does the right thing — it returns `{ statusCode: 500, body: { message: err.message, errors: [] } }`. No changes needed there.

The `ZodError → 400` branch stays as-is so request-body validation continues to return 400. We've ensured Pay.gov-origin ZodErrors are translated before they reach `handleError`.

### 4. Logging

Each catch branch should `console.error` with a tag that identifies the failure mode (Zod, DB write, network) and the `agencyTrackingId`. The existing logs in `useHttp` already capture the raw payload on schema mismatch, so we don't duplicate that.

---

## File-by-File Changes

### `src/errors/payGovError.ts`

- Change `public statusCode: number = 504` → `500`.
- Update default message to: `"We could not complete this transaction with Pay.gov. Please retry the request."`

### `src/errors/payGovError.test.ts`

- Update `statusCode` assertion from `504` → `500`.
- Update default-message assertion to match the new copy.
- Custom-message and `instanceof Error` cases unchanged.

### `src/useCases/processPayment.ts`

- Split the existing single `try/catch` into the two-`try` structure described above.
- Import `PayGovError` from `../errors/payGovError` and `ZodError` from `zod`.
- Add `safeUpdateToFailed` helper (inline in this file unless it's needed elsewhere — YAGNI).
- Preserve the existing `FailedTransactionError` path verbatim, including the `findByReferenceId` + `toTransactionRecordSummary` shape.

### `src/useCases/processPayment.test.ts`

Add a new `describe` block — *Infrastructure errors* — with cases:

1. **Zod validation failure**
   - Mock `appContext.postHttpRequest` to return a SOAP response with an invalid body (e.g. missing required `paygov_tracking_id`).
   - Assert: `processPayment` rejects with `PayGovError`.
   - Assert: `TransactionModel.updateToFailed` was called with `agencyTrackingId` and a Zod-related detail string.
   - Assert: `TransactionModel.updateAfterPayGovResponse` was *not* called.

2. **`makeSoapRequest` network failure**
   - Mock `appContext.postHttpRequest` to throw a generic `Error('ECONNRESET')`.
   - Assert: rejects with `PayGovError`.
   - Assert: `updateToFailed` called with a network-related detail string.

3. **`updateAfterPayGovResponse` DB failure**
   - Mock `appContext.postHttpRequest` to return `mockSuccessfulResponse`.
   - Mock `TransactionModelMock.updateAfterPayGovResponse.mockRejectedValueOnce(new Error('db down'))`.
   - Assert: rejects with `PayGovError`.
   - Assert: `updateToFailed` was called as the recovery step.

4. **Recovery `updateToFailed` itself fails** (edge case — don't crash on the recovery)
   - Both `updateAfterPayGovResponse` and `updateToFailed` mocked to reject.
   - Assert: still rejects with `PayGovError` (not the DB error), so the client gets a useful 500.

### Optional: `handleError.test.ts`

If one doesn't exist already, add a small regression test asserting `PayGovError` → 500 with the message body. (Confirm before adding — file may already cover this.)

---

## Implementation Steps

1. **Update `PayGovError` + its unit test** — smallest change, lets the rest of the work compile.
2. **Refactor `processPayment.ts`** into the two-`try` structure.
3. **Add the four new test cases** in `processPayment.test.ts`.
4. **Run `npm test`** for the package; fix any cascade failures (other tests that imported `PayGovError` may need updating if they referenced `504`).
5. **Manually verify the response shape** via an integration test or local invocation if available — a malformed mock should yield a 500 with the retry message rather than a 400 ZodError dump.
6. **Open PR titled** `PAY-294 feat: handle Pay.gov fault errors in processPayment` with a brief description that links each acceptance-criteria checkbox to the test that covers it.

---

## Open Questions / Risks

- **`PayGovError` statusCode change** — `504` was originally chosen to signal *upstream unavailable*. The ticket explicitly overrides this to `500`. Confirm with reviewer that no external consumer is already relying on `504`. (Grep across the repo before merging.)
- **Recovery write race** — If we mark the row failed in the `updateAfterPayGovResponse` catch, but Pay.gov *did* successfully settle the payment, we now show the user a failed transaction for what is actually a processed one. The remediation is operational (reconciliation), not in scope here, but worth noting in the PR description.
- **Generic error message** — The acceptance criteria say "encourage retrying," but some failures (e.g. invariant-violating Zod errors that will recur on retry) are not retry-safe. We're matching the ticket's stated UX; revisit if support starts seeing retry loops.

---

## Out of Scope

- Retries inside `makeSoapRequest` (would belong in a separate ticket about transport-layer resilience).
- Reconciliation tooling for transactions where Pay.gov settled but our DB failed.
- Renaming `PayGovError` to something more accurate (`PayGovUnavailableError` etc.) — keep the rename out of this change to limit blast radius.
