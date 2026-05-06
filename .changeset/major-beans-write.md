---
"@ustaxcourt/payment-portal": patch
---

#### `initPayment` Use Case

- Replaced the blanket `ConflictError` throw for duplicate `transactionReferenceId` with a two-path check keyed on `lastUpdatedAt`:
  - **Token < 3 hours old** (`MAX_TOKEN_AGE_MS = 10_800_000`): returns the existing `paygovToken` and reconstructed `paymentRedirect` URL without touching Pay.gov.
  - **Token ≥ 3 hours old**: calls `TransactionModel.updateToFailed(agencyTrackingId, 5009, "Existing token expired")` on the stale record, then falls through to the normal Pay.gov token-request path.

### `TransactionModel.findInFlightByReferenceId`

- Narrowed the status filter from `['received', 'initiated', 'pending']` to `['initiated']` — only `initiated` records have a Pay.gov token worth reusing.
- Fixed a Knex bug introduced in that same commit: the value passed to `.whereIn` was the bare string `'initiated'` (which Knex iterates as individual characters), not the array `['initiated']`.

### Tests

- **Unit** (`src/useCases/initPayment.test.ts`): replaced the old `it.each` ConflictError assertion with two focused cases — fresh-token reuse (asserts `createReceived` and `updateToFailed` are not called) and expired-token eviction (asserts `updateToFailed` fires with code 5009 and a new token is returned).
- **Integration** (`src/test/integration/initPayment.test.ts`): added two cases — calling `/init` twice with the same `transactionReferenceId` returns identical token/redirect on the second call; calling with two distinct IDs returns two different tokens. Minor field-name sync with PAY-290 in the existing happy-path test.
