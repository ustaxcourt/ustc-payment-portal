## Issues worth addressing before merge

### 1. Acceptance criteria literal-read vs. the implementation (call out in PR description)

The ticket says **"Throw 500"** three times. The implementation throws:

| Case | Ticket says | This PR throws | Reviewer might fail it for… |
| --- | --- | --- | --- |
| ZodError | `500` (via `payGovError.ts`) | `PayGovError` → **504** | Not literal 500 |
| `updateAfterPayGovResponse` fails | `500` | `ServerError` → **500** | ✓ matches |
| `makeSoapRequest` fails | `500` (via `payGovError.ts`) | `PayGovError` → **504** | Not literal 500 |

The doc justifies "5xx, not literal 500" — and I agree on the merits (504 is the honest upstream-gateway signal). But the PR description currently doesn't bridge that gap for a QA/PM doing checkbox review. **Action**: in the PR body, explicitly map each AC checkbox to the test that covers it and call out the 504 interpretation. The doc already has this — copy it into the PR description so it's visible without opening the file. Get a thumbs-up from the ticket author *before* merge so this doesn't bounce in QA.

### 2. `failedRows` vs. shadowed-variable workaround leaks intent

In [processPayment.ts:78-87](../src/useCases/processPayment.ts#L78-L87) the catch-branch local got renamed `failedRows` and inlined to dodge `no-shadowed-variable`. That's fine, but the *outer* variable is also named `transactions` — once we renamed inside, the symmetric rename outside would read better and remove the linting-driven asymmetry:

```ts
const allRows = await TransactionModel.findByReferenceId(...);
return { paymentStatus, transactions: allRows.map(toTransactionRecordSummary) };
```

Minor. Take or leave.

### 3. Three duplicated `PayGovError` instances with identical copy

In `processPayment.ts` both the ZodError branch and the catch-all SOAP branch throw `new PayGovError("We could not complete this transaction with Pay.gov. Please retry the request.")`. Three constructor invocations with the same string is a smell — if marketing/legal changes the copy, that's three edits.

Pull it once at module scope:

```ts
const PAYGOV_RETRY_MESSAGE = "We could not complete this transaction with Pay.gov. Please retry the request.";
```

Also flagged by the ticket itself ("message to client should encourage retrying") — a named constant makes "the retry message" a single thing the ticket can point at.

### 4. `initPayment` keeps a misleading `EXISTING_TOKEN_ERROR_CODE` for a non-existing-token failure

[initPayment.ts:119](../src/useCases/initPayment.ts#L119):

```ts
await safeUpdateToFailed(agencyTrackingId, EXISTING_TOKEN_ERROR_CODE, "Existing token expired");
```

This runs when `makeSoapRequest` itself fails (network blip, malformed SOAP). The `returnCode = 5009` ("Existing token") and the `returnDetail = "Existing token expired"` are both **incorrect** for that failure mode — there was no existing token, the SOAP call just failed. This is pre-existing (not introduced by this PR), but the refactor touched these lines and it's a bug staring at you. Two minutes to fix:

```ts
await safeUpdateToFailed(agencyTrackingId, undefined, "Error communicating with Pay.gov");
```

If you don't want to expand scope, **note it in the PR description as known-pre-existing** so it's logged for follow-up. Otherwise it stays buried.

### 5. `console.log("processPayment result", result)` logs a Pay.gov response payload

[processPayment.ts:104](../src/useCases/processPayment.ts#L104). Not added by this PR, but the refactor moved the line. The payload contains `paygov_tracking_id`, `payment_type`, `transaction_amount`, etc. — depending on FedRAMP/PCI scope, these may not belong in info-level logs. The codebase has [src/utils/logger.ts](../src/utils/logger.ts) (pino-based, from PAY-302). At minimum: downgrade to debug, ideally route through the structured logger. Out of scope to fix here, but worth a follow-up ticket if one doesn't exist.

### 6. `handleError.ts` branch reorder is a no-op

The swap of the `ZodError` and `PayGovError` branches in `handleError.ts` doesn't change behavior — `ZodError` and `PayGovError` are unrelated classes, so the `else if` chain produces identical output either way. It expands the diff (and a future merge-conflict surface) for zero functional gain. **Suggest reverting this hunk** to minimize blast radius. If you keep it, justify it as "reads better grouped by 5xx" in the PR — but I'd revert.

### 7. Test for `safeUpdateToFailed` is fine but skips one assertion

[safeUpdateToFailed.test.ts](../src/utils/safeUpdateToFailed.test.ts) covers the three behaviors that matter (forwarding, swallow, log). One gap: it doesn't assert `updateToFailed` is called with `undefined` for optional args when omitted — only the all-args case. Not blocking.
