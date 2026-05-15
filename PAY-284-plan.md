# PAY-284: Fee Versioning

## Background

`fees.fee_id` currently serves two purposes: it is the database primary key _and_ the string DAWSON sends in every `initPayment` request (e.g. `"PETITION_FILING_FEE"`). That works today because there is only one version of each fee. When the Court raises the petition filing fee, DAWSON will keep sending the same string, but the Payment Portal needs to charge a different amount — which requires a second row in the fees table with a different primary key.

The solution is to split `fee_id` into two columns:

| Column | Role |
|---|---|
| `fee_id` | Version-specific PK — unique per row, e.g. `"PETITION_FILING_FEE"` → `"PETITION_FILING_FEE_2"` |
| `fee_key` | Stable client-facing identifier — what DAWSON keeps sending, shared across all versions |

Because `transactions.fee_id` will point to the exact version that was active at payment time, `transaction_amount` becomes redundant — the charge is always `fees.amount` for that version.

---

## Schema changes

### Migration 1 — `[timestamp]_add_fee_versioning.ts`

Add to `fees`:

| Column | Type | Notes |
|---|---|---|
| `fee_key` | `varchar(100) NOT NULL` | Backfill: `fee_key = fee_id`. Index: `idx_fees_fee_key`. |
| `activation_date` | `timestamptz NOT NULL` | Backfill: `activation_date = created_at`. |
| `is_active` | `boolean NOT NULL DEFAULT false` | Backfill: `true` for all existing rows. |

New indexes:
- `UNIQUE (fee_key, activation_date)` — no two versions of the same key can share a timestamp
- `UNIQUE (fee_key) WHERE is_active = true` — DB-enforced at-most-one active version per key

### Migration 2 — `[timestamp]_remove_transaction_amount.ts`

Remove from `transactions`:
- Drop constraint `transactions_transaction_amount_nonneg`
- Drop column `transaction_amount`

Down migration: re-add column as nullable, backfill from `JOIN fees ON transactions.fee_id = fees.fee_id`, alter to NOT NULL, re-add constraint.

---

## Seed data — `db/seeds/data/fees.ts`

Add `fee_key`, `activation_date`, `is_active` to the `FeesRow` type and to each seed entry. For the initial versions, `fee_key = fee_id` (the existing value), `is_active = true`.

---

## Application changes

### `src/schemas/FeeId.schema.ts` → `src/schemas/FeeKey.schema.ts`

Rename exports: `FeeIdSchema` → `FeeKeySchema`, `FeeId` → `FeeKey`. Update OpenAPI description. Remove the stale `TODO: replace with DB lookup` comment. **Enum values are unchanged.**

### `src/schemas/InitPayment.schema.ts`

- `feeId: FeeIdSchema` → `fee: FeeKeySchema`
- Update `superRefine` metadata check: `data.feeId` → `data.fee`

### `src/types/ClientPermission.ts`

- `allowedFeeIds: string[]` → `allowedFeeKeys: string[]`

### `src/authorizeClient.ts`

- Rename parameter `feeId` → `feeKey`; use `client.allowedFeeKeys`

### `src/clients/permissionsClient.ts`

- Rename `allowedFeeIds` → `allowedFeeKeys` in local-dev mock, Secrets Manager validation, and type construction

### `src/db/FeesModel.ts`

- Add properties: `feeKey`, `activationDate`, `isActive`
- Add method: `getActiveFeeByKey(feeKey: string)` → `WHERE fee_key = ? AND is_active = true`
- Keep `getFeeById(feeId)` for internal lookups by stored FK

### `src/useCases/initPayment.ts`

- Destructure `fee` (fee_key) from request
- Call `authorizeClient(client, fee)`
- Call `getActiveFeeByKey(fee)` → returns version-specific row
- Store `fee.feeId` (version-specific) in the transaction via `createReceived()`
- Still calculate `transactionAmount` locally for the Pay.gov SOAP request — just don't persist it
- Remove `transactionAmount` from `createReceived()` call

### `src/useCases/processPayment.ts`

The auth check currently passes `transaction.feeId` (a version-specific PK like `"PETITION_FILING_FEE_2"`) to `authorizeClient`, which would fail against `allowedFeeKeys: ["PETITION_FILING_FEE"]`. Fix: load fee first, authorize using `fee.feeKey`.

```
// Before
authorizeClient(client, transaction.feeId);
...
const fee = await FeesModel.getFeeById(transaction.feeId);

// After
const fee = await FeesModel.getFeeById(transaction.feeId);
if (!fee) throw new NotFoundError(...)
authorizeClient(client, fee.feeKey);
```

### `src/useCases/getDetails.ts`

Same reorder as `processPayment` (lines 54–58). Load fee before calling `authorizeClient`, then pass `fee.feeKey`.

### `src/db/TransactionModel.ts`

- Remove `transactionAmount` property and its `$parseDatabaseJson` cast
- Remove `transactionAmount` from `createReceived()` parameter type
- In `getAll()` and `getByPaymentStatus()`: add `'f.amount as transactionAmount'` to the SELECT — the dashboard continues to receive a `transactionAmount` field, now sourced from the fee join rather than the dropped column

### `src/schemas/TransactionDashboard.schema.ts`

No change — `transactionAmount` remains in the schema; it is now populated by the join alias above.

---

## Tests

| File | Change |
|---|---|
| `src/lambdaHandler.test.ts` | `feeId` → `fee` in request bodies; `allowedFeeIds` → `allowedFeeKeys` |
| `src/authorizeClient.test.ts` | `allowedFeeIds` → `allowedFeeKeys` |
| `src/clients/permissionsClient.test.ts` | `allowedFeeIds` → `allowedFeeKeys` |
| `src/useCases/initPayment.test.ts` | `feeId` → `fee`; mock fee objects gain `feeKey`; remove `transactionAmount` from `createReceived` assertions |
| `src/useCases/processPayment.test.ts` | `allowedFeeIds` → `allowedFeeKeys`; mock fee objects gain `feeKey` |
| `src/useCases/getDetails.test.ts` | `allowedFeeIds` → `allowedFeeKeys`; mock fee objects gain `feeKey` |
| `src/db/TransactionModel.test.ts` | Remove `transactionAmount` from test data |
| `src/test/integration/migration.test.ts` | Assert `transaction_amount` column is absent; assert `fee_key`, `activation_date`, `is_active` exist on `fees` |

---

## Changeset — `.changeset/swift-kiwis-fail.md`

Note as breaking changes:
- `initPayment` request field renamed `feeId` → `fee`
- Client permissions config (`allowedFeeIds` → `allowedFeeKeys`) requires Secrets Manager update per client
- `transaction_amount` column removed from the `transactions` table

---

## Out of scope

- **Creating new fee versions** — inserting a second version and toggling `is_active` is an operational concern deferred to a future story. The partial unique index enforces correctness at the DB level.
- **Variable fees** — both current fees are `is_variable = false`. If variable fees are introduced later, a separate `override_amount` column on `transactions` would be needed.
