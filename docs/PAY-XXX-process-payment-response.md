# Process Payment: Response to Client — Implementation Plan

## Objective

Migrate the `POST /process` response from the current v1 shape (`trackingId`, `transactionStatus`, `message`, `code`) to the v2 contract (`paymentStatus`, `transactions[]`) so the client app receives the overall payment outcome and a summary of every transaction attempted for the same `transactionReferenceId`.

> **Convention:** The v2 Zod schema (`ProcessPaymentResponseSchema`) and `TransactionRecordSummarySchema` already exist and define the target contract. This work wires the use case to conform to them.

---

## Breaking Change Notice

This is a **breaking change** to the `POST /process` response contract. Every field the client currently reads (`trackingId`, `transactionStatus`, `message`, `code`) is replaced by a new shape (`paymentStatus`, `transactions[]`).

**Client coordination required:** Before merging, confirm with all consuming client apps that they are prepared to handle the v2 response. If any client cannot update simultaneously, we will need to either:
- Version the endpoint (`/v2/process`) and deprecate `/process` on a timeline, or
- Ship both shapes in the response temporarily (old fields + new fields) and remove the old fields in a follow-up once clients have migrated.

**Current assumption:** All client teams have agreed to the v2 contract as documented in the API spec, and will update their integration in lockstep with this deployment.

---

## Key Distinction: `paymentStatus` vs `transactionStatus`

| Concept              | Scope                        | Values                         |
|----------------------|------------------------------|--------------------------------|
| `paymentStatus`      | Aggregate across all attempts for a `transactionReferenceId` | `"success"` · `"failed"` · `"pending"` (lowercase) |
| `transactionStatus`  | Single attempt               | `"Success"` · `"Failed"` · `"Pending"` · `"Received"` · `"Initiated"` (PascalCase) |

Derivation logic for `paymentStatus`:
- If **any** transaction for the reference has `transactionStatus === "Success"` → `"success"`
- If **all** transactions for the reference have `transactionStatus === "Failed"` → `"failed"`
- Otherwise → `"pending"`

---

## What happened to `code`?

The v1 response included a `code` field (Pay.gov's numeric `return_code`, e.g. `3001`) on failure. The v2 `TransactionRecordSummarySchema` does not include it — only `returnDetail` (the human-readable message).

**Justification:** The agreed-upon v2 API contract (`ProcessPaymentResponseSchema` / `TransactionRecordSummarySchema`) was finalized without `code`. The `returnDetail` string carries the actionable information ("The card has been declined..."). If a client needs the numeric code for programmatic branching, that should be raised as a schema amendment before this work merges — not silently added.

---

## Known Risk: SOAP success + DB write failure

After Pay.gov processes a payment, we persist the result to our database. If `updateToProcessed` fails (e.g., transient DB connectivity issue), the payment succeeded at Pay.gov but our record still shows `"initiated"`. This is a pre-existing gap (the old code never persisted the result at all), and this ticket improves the situation by adding the write. However, the failure mode now surfaces as an unhandled exception returned to the client as a 500 — even though their payment went through.

**Accepted for now:** A full solution (retry queue, idempotent reconciliation) is out of scope. The `console.log` of the Pay.gov result ensures we have evidence in CloudWatch to reconcile manually if needed. A future resilience ticket should add structured error logging and a dead-letter mechanism for failed DB writes after successful SOAP calls.

---

## Type Mapping Reference

Two naming convention mismatches exist between the DB layer and the API layer. Both are handled by mapping functions in `processPayment.ts`:

**`toDbTransactionStatus`** — API PascalCase → DB lowercase:
| API (`TransactionStatus.schema`) | DB (`DashboardTransactionStatus`) |
|---|---|
| `"Success"` | `"processed"` |
| `"Failed"` | `"failed"` |
| `"Pending"` | `"pending"` |
| `"Received"` | `"received"` |
| `"Initiated"` | `"initiated"` |

**`toApiPaymentMethod`** — DB snake_case → API display format:
| DB (`PaymentMethod`) | API (`PaymentMethod.schema`) |
|---|---|
| `"plastic_card"` | `"Credit/Debit Card"` |
| `"ach"` | `"ACH"` |
| `"paypal"` | `"PayPal"` |
| `null` / `undefined` | `undefined` |

---

## Steps

### ~~1. Add `derivePaymentStatus` helper~~ DONE

**File:** `src/useCases/derivePaymentStatus.ts` (created)

Pure function that takes an array of `TransactionStatus` values and returns a single `PaymentStatus`:
- Any `"Success"` → `"success"`
- All `"Failed"` (non-empty) → `"failed"`
- Otherwise → `"pending"`

Isolated in its own file for reuse (future `getDetails` v2, dashboard) and zero-dependency testing.

**Tests:** `src/useCases/derivePaymentStatus.test.ts` — 5 cases, all passing.

---

### ~~2. Update `TransactionModel` — persist process result + query stub~~ DONE

**File:** `src/db/TransactionModel.ts`

**2a. `updateToProcessed` added** — patches `paygovTrackingId`, `transactionStatus`, and `paymentStatus` after a successful SOAP call. Parameter uses the DB's `TransactionStatus` type (lowercase) to satisfy Objection's column typing.

**2b. TODO comment added** for `findByTransactionReferenceId` — scoped to the follow-up ticket. The use case wraps the single current transaction in a one-element array so the response shape is v2-compliant from day one.

---

### ~~3. Rewrite `processPayment` use case~~ DONE

**File:** `src/useCases/processPayment.ts`

Changes made:
1. Response type now sourced from Zod schema (`ProcessPayment.schema.ts`), not the old hand-written type
2. Added `toDbTransactionStatus` and `toApiPaymentMethod` mapping functions (see Type Mapping Reference above)
3. Success/Pending path: parse status → derive `paymentStatus` → persist via `updateToProcessed` → return v2 shape
4. Failed path: persist via `updateToFailed` → return `paymentStatus: "failed"` with `returnDetail` carrying the error message
5. Single-element `transactions[]` array until `findByTransactionReferenceId` lands

---

### 4. Remove the old response type

**File:** `src/types/ProcessPaymentResponse.ts` — **Delete entirely.**

The Zod schema in `ProcessPayment.schema.ts` is now the single source of truth for the response type.

**Before deleting**, verify no other file imports from this path:

```bash
grep -r "ProcessPaymentResponse" src/ --include="*.ts" -l
```

Expected: only `processPayment.ts` (already updated) and the test file (updated in step 6). If anything else imports it, update those imports first.

---

### 5. Update OpenAPI registry description

**File:** `src/openapi/registry.ts`

Line ~226 currently reads:

```ts
description: "Payment processed. Check transactionStatus for Success or Failed.",
```

Update to:

```ts
description:
  "Payment processed. The paymentStatus field indicates the overall outcome (success, failed, pending). " +
  "The transactions array contains a summary of each attempt for the same transactionReferenceId.",
```

The schema reference (`ProcessPaymentResponseSchema`) already points to the v2 shape, so no schema change is needed here.

---

### 6. Update unit tests

**File:** `src/useCases/processPayment.test.ts`

#### 6a. Expand the `TransactionModel` mock

The current mock only stubs `findByPaygovToken`. Add:

```ts
default: {
  findByPaygovToken: jest.fn(),
  updateToProcessed: jest.fn().mockResolvedValue(undefined),
  updateToFailed: jest.fn().mockResolvedValue(undefined),
},
```

#### 6b. Return a fuller mock transaction

`findByPaygovToken` must now return an object with `agencyTrackingId`, `feeId`, `createdAt`, `lastUpdatedAt`, and `paymentMethod` — these are all read when building the v2 response:

```ts
TransactionModelMock.findByPaygovToken.mockResolvedValue({
  feeId: "fee-123",
  agencyTrackingId: "agency-tracking-id-001",
  createdAt: "2026-01-15T10:30:00Z",
  lastUpdatedAt: "2026-01-15T10:35:00Z",
  paymentMethod: "plastic_card",
} as TransactionModel);
```

#### 6c. Rewrite assertions — v1 → v2 mapping

| Old (v1) | New (v2) |
|---|---|
| `result.trackingId === mockPayGovTrackingId` | `result.paymentStatus === "success"` |
| `result.transactionStatus === "Success"` | `result.transactions[0].transactionStatus === "Success"` |
| `result.transactionStatus === "Pending"` | `result.paymentStatus === "pending"` and `result.transactions[0].transactionStatus === "Pending"` |
| `result.trackingId` (pending) | `result.paymentStatus === "pending"` |
| `result.trackingId` is undefined (failure) | `result.paymentStatus === "failed"` |
| `result.transactionStatus === "Failed"` | `result.transactions[0].transactionStatus === "Failed"` |
| `result.message === "The card has been declined..."` | `result.transactions[0].returnDetail === "The card has been declined..."` |
| `result.code === 3001` | _(dropped — not in v2 schema, see "What happened to `code`?" above)_ |

#### 6d. Add new assertions

- `result.transactions` has length `1` (single-element array until DB query ticket lands)
- `result.transactions[0].paymentMethod` equals `"Credit/Debit Card"` (mapped from `"plastic_card"`)
- `result.transactions[0].createdTimestamp` and `updatedTimestamp` are populated
- `TransactionModel.updateToProcessed` called with correct args on success/pending
- `TransactionModel.updateToFailed` called with correct `agencyTrackingId` on failure

#### 6e. Fault handling edge cases

The "fault without detail" and "fault with detail but no TCSServiceFault" tests currently assert `transactionStatus === "Failed"` and `message`. Update to:

```ts
expect(result.paymentStatus).toBe("failed");
expect(result.transactions[0].transactionStatus).toBe("Failed");
expect(result.transactions[0].returnDetail).toBe("Transaction Error");
```

---

### 7. Update handler test

**File:** `src/lambdaHandler.test.ts`

Line 14 currently mocks the processPayment return value as:

```ts
processPayment: jest.fn().mockResolvedValue({
  trackingId: "track-123",
  transactionStatus: "Success",
}),
```

Update to:

```ts
processPayment: jest.fn().mockResolvedValue({
  paymentStatus: "success",
  transactions: [
    {
      transactionStatus: "Success",
      paymentMethod: "Credit/Debit Card",
      returnDetail: undefined,
      createdTimestamp: "2026-01-15T10:30:00Z",
      updatedTimestamp: "2026-01-15T10:35:00Z",
    },
  ],
}),
```

Then update any assertions in the `processPaymentHandler` describe block that destructure or check the response body for the old fields.

---

### 8. Update integration test

**File:** `src/test/integration/transaction.test.ts`

#### 8a. Process payment assertions (lines 75-79)

Replace:

```ts
expect(data.trackingId).toBeTruthy();
expect(data.transactionStatus).toBe("Success");
payGovTrackingId = data.trackingId;
```

With:

```ts
expect(data.paymentStatus).toBe("success");
expect(data.transactions).toHaveLength(1);
expect(data.transactions[0].transactionStatus).toBe("Success");
```

#### 8b. Recovering `payGovTrackingId` for the getDetails test

The `payGovTrackingId` is no longer in the process response. The `getDetails` endpoint expects it as a path parameter. Two options:

**Option A (recommended):** The `getDetails` test already has the `token` from init. Add a helper that calls `getDetails` by `agencyTrackingId` (which we know from the init response), or look up the `payGovTrackingId` via the dashboard `GET /transactions` endpoint.

**Option B (simpler, immediate):** Since `getDetails` is a separate use case that calls Pay.gov's `getTransactionDetailsByTrackingId` SOAP endpoint, and the integration test is sequential, we can retrieve the tracking ID from the transaction record. However, the simplest path is: **the `TransactionRecordSummary` in the process response does not include `payGovTrackingId`, but the full `TransactionRecordSchema` does.** Consider whether the summary schema should include it.

**Recommended resolution:** Add `payGovTrackingId` as an optional field to `TransactionRecordSummarySchema` so the client can correlate. This is a minor schema amendment — if the team disagrees, the integration test can instead call `GET /transactions` (dashboard endpoint) to look up the tracking ID. Document whichever choice is made.

For now, if we don't amend the schema, update the integration test to skip the `getDetails` step or decouple it:

```ts
// The getDetails test can use a separately-obtained payGovTrackingId.
// Since process no longer returns it, retrieve via dashboard endpoint:
const txnList = await portalFetch(`${process.env.BASE_URL}/transactions`);
const txns = await txnList.json();
payGovTrackingId = txns.find(
  (t: any) => t.paygovToken === token
)?.paygovTrackingId;
```

> **Decision needed:** Does the team want `payGovTrackingId` in the summary schema? Flag this in PR review.

---

### 9. Regenerate OpenAPI docs

```bash
npm run generate:openapi
```

Verify `docs/openapi.json` and `docs/openapi.yaml` reflect the v2 response shape for `POST /process`.

---

### 10. Architecture Decision Record

**File:** `docs/architecture/decisions/0006-process-payment-v2-response-contract.md` (new)

The Definition of Done requires an ADR for major decisions. Switching the API response contract qualifies.

```markdown
# 6. Process Payment v2 response contract

Date: 2026-04-17

## Status

Accepted

## Context

The `POST /process` endpoint returned a flat object with `trackingId`, `transactionStatus`,
`message`, and `code`. Client apps need the overall payment outcome and visibility into all
transaction attempts for a given `transactionReferenceId` — not just the single attempt
being processed.

The v2 Zod schemas (`ProcessPaymentResponseSchema`, `TransactionRecordSummarySchema`) were
already defined ahead of this work, establishing the target contract.

## Decision

Replace the v1 response with the v2 shape:

- `paymentStatus` (aggregate: "success" | "failed" | "pending") derived from all
  transaction statuses for the reference
- `transactions[]` array of `TransactionRecordSummary` objects

The numeric `code` field is dropped. `returnDetail` (human-readable message) is the
failure descriptor. If clients need programmatic error codes, a schema amendment will
be proposed separately.

Until `findByTransactionReferenceId` is implemented (future ticket), the `transactions`
array contains only the current attempt.

## Consequences

- This is a breaking change — all consuming clients must update simultaneously
- The response is forward-compatible: once the DB query ticket lands, the array
  will contain multiple entries without another contract change
- `getDetails` remains on the v1 contract and is not affected
```

---

## Files Touched (Summary)

| File | Action | Status |
|------|--------|--------|
| `src/useCases/derivePaymentStatus.ts` | **Create** — pure function to derive `paymentStatus` | DONE |
| `src/useCases/derivePaymentStatus.test.ts` | **Create** — unit tests for derivation logic | DONE |
| `src/db/TransactionModel.ts` | **Modify** — add `updateToProcessed`, TODO for `findByTransactionReferenceId` | DONE |
| `src/useCases/processPayment.ts` | **Modify** — return v2 shape, persist result, type mappings | DONE |
| `src/types/ProcessPaymentResponse.ts` | **Delete** — replaced by Zod schema | |
| `src/openapi/registry.ts` | **Modify** — update 200 response description | |
| `src/useCases/processPayment.test.ts` | **Modify** — rewrite all assertions to v2 shape | |
| `src/lambdaHandler.test.ts` | **Modify** — update mock return values | |
| `src/test/integration/transaction.test.ts` | **Modify** — v2 assertions + `payGovTrackingId` recovery | |
| `docs/openapi.json` | **Regenerate** | |
| `docs/openapi.yaml` | **Regenerate** | |
| `docs/architecture/decisions/0006-...md` | **Create** — ADR for v2 contract decision | |

## Out of Scope

- `findByTransactionReferenceId` DB query — future ticket (placeholder comment added)
- Multi-transaction aggregation — blocked on the above; response will contain a single-element array until then
- Changes to `initPayment` or `getDetails` response contracts
- Resilience for SOAP-success + DB-write-failure (see Known Risk section)
- Adding `code` back to the v2 schema (requires team decision)
