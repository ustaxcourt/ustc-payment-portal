---
"@ustaxcourt/payment-portal": patch
---

### `POST /process` Guards

Two new checks are evaluated after the existing authorization check in `processPayment.ts`, before the Pay.gov SOAP call is made:

1. **Sibling check** — `TransactionModel.findPendingOrProcessedByReferenceId` queries for any other transaction row sharing the same `transactionReferenceId` with a `transactionStatus` of `"pending"` or `"processed"`. If found, throws `GoneError` with a message directing the client to use `getDetails`.
2. **Status check** — if no sibling exists but the current transaction's `transactionStatus` is not `"initiated"`, throws `GoneError` with a simpler "token is no longer valid" message.

Both guards are future-proofed: they become fully operational once the DB-write-after-process story lands and begins updating `transactionStatus` away from `"initiated"`.

### Errors / HTTP Status Codes

- Added `src/errors/gone.ts` — `GoneError` class with `statusCode: 410`, following the same pattern as `ForbiddenError` and `NotFoundError`.
- `handleError.ts` requires no changes — the existing `statusCode < 500` branch handles 410 generically.

### `TransactionStatus` Schema Consolidation
**This is out of scope of 224, but doing it makes checking transactions to see if they are processed cleaner.**

- `TransactionStatusSchema` (`src/schemas/TransactionStatus.schema.ts`) now uses lowercase values: `"received" | "initiated" | "processed" | "failed" | "pending"`.
- `"processed"` replaces `"success"` to avoid confusion with `PaymentStatus` (`"success" | "failed" | "pending"`). Pay.gov's `"Success"` and `"Settled"` responses are translated to `"processed"` in `parseTransactionStatus`.
- `DashboardTransactionStatusSchema` is removed from `TransactionDashboard.schema.ts`. `TransactionStatusSchema` is now used directly — including in `DashboardTransactionSchema.transactionStatus` and `TransactionModel`'s `TransactionStatus` type alias.
- All DB write methods in `TransactionModel` (`createReceived`, `updateToInitiated`, `updateToFailed`) updated to use the canonical lowercase values.
- `initPayment.ts` updated accordingly (`"received"` on create).

### API / Shared Schema

- `GoneErrorSchema` added to `src/schemas/Error.schema.ts` and registered in `src/openapi/registry.ts`.
- `POST /process` OpenAPI spec gains a `410` response entry.
- `TransactionStatusSchema` example updated from `"Success"` to `"processed"`.

---

## Testing

- `src/errors/gone.test.ts` — new unit tests for `GoneError` (custom message + default message).
- `src/useCases/processPayment.test.ts` — three new tests covering: sibling in `pending` state, sibling in `processed` state, and current transaction not in `initiated` state. `beforeEach` mock updated to include `transactionStatus: "initiated"` so all existing happy-path tests continue to pass.
- `src/lambdaHandler.test.ts` — new handler-level 410 test.
- `src/useCases/parseTransactionStatus.test.ts` — assertions updated to lowercase (`"processed"`, `"failed"`, `"pending"`).
- All other affected test files updated to use lowercase `TransactionStatus` values.

## Out of Scope / Follow-up Tickets

- The sibling and status guards are no-ops until `processPayment` writes its outcome back to the DB — **PAY-226** (or equivalent write-after-process story)
