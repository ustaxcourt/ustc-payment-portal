---
"@ustaxcourt/payment-portal": patch
---

## What Changed?

### Database / Migrations

Single migration (`20260515000001_add_fee_versioning.ts`) covers both schema changes:

- **`fees` table**: added `fee_key varchar(100) NOT NULL` (backfilled as `fee_key = fee_id`) and `activation_date timestamptz NOT NULL` (backfilled as `activation_date = created_at`). Added `idx_fees_fee_key` index and a `UNIQUE(fee_key, activation_date)` constraint preventing two versions of the same key from sharing an activation timestamp.
- **`transactions` table**: dropped `transaction_amount` column and its `transactions_transaction_amount_nonneg` CHECK constraint. Historical records are unaffected — the charge amount is now always derivable from `transactions.fee_id → fees.amount`.

`FeesModel` gains `feeKey` and `activationDate` model properties and a new `getActiveFeeByKey(feeKey)` method, which selects the most recent version with `activation_date <= NOW() ORDER BY activation_date DESC LIMIT 1`.

### Seeding

- `db/seeds/data/fees.ts` (`FeesRow` type + data): both fee rows now include `fee_key` (= `fee_id`) and `activation_date`.
- `db/seeds/data/transactions.ts`: removed `transaction_amount` from `TransactionRow` type and the insert payload; `feesList` query no longer selects `amount`.

### Fee Versioning — initPayment / processPayment / getDetails

- `initPayment` resolves the fee via `FeesModel.getActiveFeeByKey(fee)` and stores the version-specific `fee.feeId` FK on the transaction. `transactionAmount` is still calculated for the Pay.gov SOAP request but is no longer persisted.
- `processPayment` and `getDetails` previously called `authorizeClient(client, transaction.feeId)` — incorrect after versioning because `transaction.feeId` is version-specific but `allowedFeeKeys` contains the stable key. Both now load the fee via `getFeeById(transaction.feeId)` **before** the auth check and pass `fee.feeKey` to `authorizeClient`.

### API / Shared Schema

- `initPayment` request field renamed `feeId` → `fee` — **breaking change for callers**.
- `FeeId.schema.ts` → `FeeKey.schema.ts`; exports renamed `FeeIdSchema`/`FeeId` → `FeeKeySchema`/`FeeKey`; OpenAPI `$ref` changes from `#/components/schemas/FeeId` to `#/components/schemas/FeeKey`.
- `ClientPermission.allowedFeeIds` → `allowedFeeKeys` — **breaking change for Secrets Manager config**.
- Dashboard `transactionAmount` response field is unchanged for consumers. It is now sourced from `f.amount as transactionAmount` via the fee JOIN rather than the dropped column. `TransactionModel.$parseDatabaseJson` re-applies `Number()` to handle Postgres returning decimals as strings.

### Client Permissions

`permissionsClient.ts` parse loop coerces `allowedFeeIds` → `allowedFeeKeys` for secrets that haven't been migrated yet. This allows existing Secrets Manager entries to continue working after deploy without a coordinated pre-deploy update.

---

## Testing

- All unit test files updated for renamed fields (`feeId` → `fee`, `allowedFeeIds` → `allowedFeeKeys`).
- `permissionsClient.test.ts`: new test verifies the `allowedFeeIds` → `allowedFeeKeys` coercion path produces a `ClientPermission` with `allowedFeeKeys` set and no `allowedFeeIds` residue.
- Integration tests (`initPayment.test.ts`, `processPayment.test.ts`, `transaction.test.ts`, `sigv4Smoke.test.ts`): request bodies updated from `feeId` to `fee`.
- `migration.test.ts`: comment on `transactionAmount` assertion updated to note it is now sourced from the fee join.

