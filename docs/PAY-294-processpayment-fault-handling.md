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

The ticket's "500" wording is shorthand for **5xx** — i.e. "this is a server-side / upstream problem, not a client problem." We don't need (and shouldn't) force every failure to literal `500`; the existing error classes already encode the right semantics. Mapping:

- [ ] Throw `5xx` for Zod validation error on a Pay.gov response — `PayGovError` (504, upstream returned malformed data)
- [ ] Throw `5xx` for DB error from `updateAfterPayGovResponse` — `ServerError` (500, *our* DB, not Pay.gov)
- [ ] Throw `5xx` for error from `makeSoapRequest` — `PayGovError` (504, upstream unreachable/unparseable)
- [ ] Message to client should encourage retrying the call
- [ ] Mark the failure on the transaction record in the DB

---

## Current State Audit

| Area | File | Notes |
|---|---|---|
| Use case | [src/useCases/processPayment.ts](src/useCases/processPayment.ts) | Single `catch` that only handles `FailedTransactionError`. Everything else re-thrown. |
| Pay.gov error class | [src/errors/payGovError.ts](src/errors/payGovError.ts) | `statusCode = 504`. Semantically correct for upstream failures — keep as-is. |
| Pay.gov error tests | [src/errors/payGovError.test.ts](src/errors/payGovError.test.ts) | Asserts `statusCode === 504`. No change needed. |
| Generic server error class | [src/errors/serverError.ts](src/errors/serverError.ts) | `statusCode = 500`. Used for our-side failures (e.g. DB write). |
| Top-level handler | [src/handleError.ts](src/handleError.ts) | Maps `ZodError → 400`, has a `PayGovError` branch using `err.statusCode`. |
| SOAP entry point | [src/entities/CompleteOnlineCollectionWithDetailsRequest.ts](src/entities/CompleteOnlineCollectionWithDetailsRequest.ts) | Throws raw `parsed.error` (ZodError) on schema mismatch. |
| DB layer | [src/db/TransactionModel.ts:161](src/db/TransactionModel.ts#L161) | `updateAfterPayGovResponse` and `updateToFailed` both throw on knex errors. |
| Existing tests | [src/useCases/processPayment.test.ts](src/useCases/processPayment.test.ts) | Has success / `FailedTransactionError` / fault-without-detail coverage. No coverage for Zod failure, DB write failure, or network failure. |

### Important nuance: ZodError mapping

`handleError` currently checks `err instanceof ZodError` *before* the other branches. That branch returns `400`, which is correct for client-input validation (e.g. request body parsing) but **wrong** for Pay.gov response validation. Two ways to fix:

1. **Translate at the source** — convert the `ZodError` into a `PayGovError` inside the SOAP entity (or inside `processPayment`'s catch) so it never reaches the `ZodError` branch in `handleError`. *Preferred*: keeps `handleError` semantics intact and matches the ticket's note ("via `payGovError.ts`").
2. **Reorder branches** — let `ZodError` continue propagating and add a branch in `handleError` that distinguishes Pay.gov-origin ZodErrors. Fragile and couples the global handler to upstream call sites.

We will go with (1). The translated error is a `PayGovError` (504) — Pay.gov is the source of the malformed payload, so the gateway-class status is the honest signal.

---

## Design

### 1. Use existing error classes — do not mutate status codes

We deliberately **do not** change `PayGovError.statusCode` to `500`. The HTTP status is a property of the error *class*, not of the call site. The right pattern is to pick the class whose status semantically matches each failure:

| Failure mode | Error class | Status | Why |
|---|---|---|---|
| Pay.gov returns malformed SOAP body (ZodError) | `PayGovError` | `504` | Upstream sent us garbage. |
| `makeSoapRequest` network / parse failure | `PayGovError` | `504` | Upstream unreachable / unparseable. |
| `updateAfterPayGovResponse` DB write fails | `ServerError` | `500` | Our infrastructure, not Pay.gov. |

Both classes already exist and `handleError` already maps each one correctly. The only thing this ticket needs to add is **retry-encouraging messaging** at the call site (passed via the constructor's optional `message` arg), and the **DB-marking side effect** before re-throwing.

Example messages (final wording subject to UX review):

- `PayGovError("We could not complete this transaction with Pay.gov. Please retry the request.")`
- `ServerError("Failed to record the payment result. Please retry the request.")`

### 2. Catch three explicit categories in `processPayment`

Replace the current single `if (err instanceof FailedTransactionError) … else throw err` block with a structured handler that:

1. Keeps the existing `FailedTransactionError` branch intact (Pay.gov *successfully* told us the transaction failed → `updateToFailed` → return `paymentStatus: "failed"`).
2. Adds branches for each of the three failure modes the ticket calls out:
   - `ZodError` → DB row marked failed → throw `PayGovError` (504).
   - DB error from `updateAfterPayGovResponse` → DB row already in `initiated`; best-effort `updateToFailed` → throw `ServerError` (500).
   - Any other error originating from `makeSoapRequest` → DB row marked failed → throw `PayGovError` (504).

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
    throw new PayGovError("We could not complete this transaction with Pay.gov. Please retry the request.");
  }
  // Network/parse/other failures from makeSoapRequest
  await safeUpdateToFailed(transaction.agencyTrackingId, undefined, "Error communicating with Pay.gov");
  throw new PayGovError("We could not complete this transaction with Pay.gov. Please retry the request.");
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
  throw new ServerError("Failed to record the payment result. Please retry the request.");
}
```

`safeUpdateToFailed` lives in `src/utils/safeUpdateToFailed.ts` and is shared across use cases. It wraps `TransactionModel.updateToFailed`, swallows any DB error, and logs it — if marking failed *also* fails, we still need to throw the original 5xx to the client rather than crashing on the recovery step. The swallowing policy belongs here rather than on `TransactionModel` itself: the model should throw on failure and let callers decide; `safeUpdateToFailed` is that caller-level decision.

### 3. `handleError` mapping

No changes needed in [src/handleError.ts](src/handleError.ts):

- `PayGovError` → handled by its existing branch, returns `{ statusCode: 504, body: { message, errors: [] } }`.
- `ServerError` → handled by its existing branch, returns `{ statusCode: 500, body: { message, errors: [] } }`.
- `ZodError → 400` branch stays as-is so request-body validation continues to return 400; Pay.gov-origin ZodErrors are translated before they reach `handleError`.

### 4. Logging

Each catch branch should `console.error` with a tag that identifies the failure mode (Zod, DB write, network) and the `agencyTrackingId`. The existing logs in `useHttp` already capture the raw payload on schema mismatch, so we don't duplicate that.

---

## File-by-File Changes

### `src/errors/payGovError.ts`

- **No change required.** Keep `statusCode = 504` and the existing default message. Call sites that want retry-encouraging copy can pass it via the constructor argument.

### `src/errors/payGovError.test.ts`

- **No change required.**

### `src/errors/serverError.ts`

- **No change required.** `statusCode = 500` already, default message exists, accepts a custom message via the constructor.

### `src/utils/safeUpdateToFailed.ts` *(new file)*

- Create the shared helper:

```ts
export const safeUpdateToFailed = async (
  agencyTrackingId: string,
  code?: number,
  detail?: string,
): Promise<void> => {
  try {
    await TransactionModel.updateToFailed(agencyTrackingId, code, detail);
  } catch (err) {
    console.error(
      `Failed to mark transaction '${agencyTrackingId}' as failed during error recovery:`,
      err,
    );
  }
};
```

### `src/useCases/processPayment.ts`

- Split the existing single `try/catch` into the two-`try` structure described above.
- Import `PayGovError` from `../errors/payGovError`, `ServerError` from `../errors/serverError`, `ZodError` from `zod`, and `safeUpdateToFailed` from `../utils/safeUpdateToFailed`.
- Preserve the existing `FailedTransactionError` path verbatim, including the `findByReferenceId` + `toTransactionRecordSummary` shape.

### `src/useCases/initPayment.ts`

- Replace the two inline `.catch((dbErr) => console.error(...))` recovery patterns (after `makeSoapRequest` failure and after `updateToInitiated` failure) with `await safeUpdateToFailed(...)`.
- Import `safeUpdateToFailed` from `../utils/safeUpdateToFailed`.

### `src/useCases/processPayment.test.ts`

Add a new `describe` block — *Infrastructure errors* — with cases:

1. **Zod validation failure**
   - Mock `appContext.postHttpRequest` to return a SOAP response with an invalid body (e.g. missing required `paygov_tracking_id`).
   - Assert: `processPayment` rejects with `PayGovError` (statusCode 504).
   - Assert: `TransactionModel.updateToFailed` was called with `agencyTrackingId` and a Zod-related detail string.
   - Assert: `TransactionModel.updateAfterPayGovResponse` was *not* called.

2. **`makeSoapRequest` network failure**
   - Mock `appContext.postHttpRequest` to throw a generic `Error('ECONNRESET')`.
   - Assert: rejects with `PayGovError` (statusCode 504).
   - Assert: `updateToFailed` called with a network-related detail string.

3. **`updateAfterPayGovResponse` DB failure**
   - Mock `appContext.postHttpRequest` to return `mockSuccessfulResponse`.
   - Mock `TransactionModelMock.updateAfterPayGovResponse.mockRejectedValueOnce(new Error('db down'))`.
   - Assert: rejects with `ServerError` (statusCode 500) — *not* `PayGovError`, because the failure is on our side.
   - Assert: `updateToFailed` was called as the recovery step.

4. **Recovery `updateToFailed` itself fails** (edge case — don't crash on the recovery)
   - Both `updateAfterPayGovResponse` and `updateToFailed` mocked to reject.
   - Assert: still rejects with `ServerError` (not the raw DB error), so the client gets a useful 5xx.

### Optional: `handleError.test.ts`

`PayGovError → 504` and `ServerError → 500` mappings are already covered by the existing class tests and the default `handleError` branches. Skip unless coverage is genuinely missing.

---

## Implementation Steps

1. **Create `src/utils/safeUpdateToFailed.ts`** with the shared helper.
2. **Update `initPayment.ts`** to import and use `safeUpdateToFailed` in place of the two inline `.catch()` recovery calls.
3. **Refactor `processPayment.ts`** into the two-`try` structure, importing `PayGovError`, `ServerError`, `ZodError`, and `safeUpdateToFailed`.
4. **Add the four new test cases** in `processPayment.test.ts`.
5. **Run `npm test`** for the package; verify no cascade failures.
4. **Manually verify the response shape** via an integration test or local invocation if available — a malformed Pay.gov mock should yield a 504 with the retry message; a forced DB failure should yield a 500.
5. **Open PR titled** `PAY-294 feat: handle Pay.gov fault errors in processPayment` with a brief description that links each acceptance-criteria checkbox to the test that covers it.

---

## Open Questions / Risks

- **Recovery write race** — If we mark the row failed in the `updateAfterPayGovResponse` catch, but Pay.gov *did* successfully settle the payment, we now show the user a failed transaction for what is actually a processed one. The remediation is operational (reconciliation), not in scope here, but worth noting in the PR description.
- **Generic error message** — The acceptance criteria say "encourage retrying," but some failures (e.g. invariant-violating Zod errors that will recur on retry) are not retry-safe. We're matching the ticket's stated UX; revisit if support starts seeing retry loops.
- **Ticket wording vs. status codes** — PAY-294 says "throw 500" in three places. That should be read as "throw a 5xx" — the existing class system already encodes the right precise status for each case (504 for upstream, 500 for internal). No code change needed to `payGovError.ts` despite the ticket naming it; the *call sites* are where the work happens.

---

## Out of Scope

- Retries inside `makeSoapRequest` (would belong in a separate ticket about transport-layer resilience).
- Reconciliation tooling for transactions where Pay.gov settled but our DB failed.
- Renaming `PayGovError` to something more accurate (`PayGovUnavailableError` etc.) — keep the rename out of this change to limit blast radius.
