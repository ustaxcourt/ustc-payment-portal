---
"@ustaxcourt/payment-portal": patch
---

### processPayment
**updated to return transaction array returned from DB for both the success and fail cases**
- `toTransactionSummary()` was removed from `getDetails.ts`, and placed in its own util file so we can use it for both `processPayment.ts` and `getDetails.ts`. See `src/utils/toTransactionRecordSummary.ts`.
- Calls `findByReferenceId` after updating the DB (both on success and on `FailedTransactionError`) and returns the full `transactions` array alongside `paymentStatus`

#### toTransactionSummary
- Parameters were updated to pull transactionStatus from row, instead of a separater parameter.

### Seeding

`generateTransactions` gained a `multiAttemptGroups` parameter. Each group produces a set of rows sharing `transactionReferenceId`, `feeId`, `clientName`, and base timestamp, with attempts spaced 20–60 minutes apart to reflect the 3-hour Pay.gov token window. `02_dummy_data.ts` seeds 10 groups of `['failed', 'success']` to populate the dev/CI environment with realistic multi-attempt data.

### Database
`20260424164039_remove_idx_transactions_client_ref.ts`: The down function no longer restores the original full UNIQUE constraint on (client_name, transaction_reference_id). Once multi-attempt transactions exist it can never be safely re-added.

---

## Testing

- `processPayment.test.ts` unit test was updated to mock `findByReferenceId` with representative row fixtures for each outcome: processed, failed, pending, and fault. `returnCode` was added to the mock failed row.
- `processPayment.test.ts` integration test was refactored to test transactions with multiple attempts (separate case for succeeding on the second attempt to pay, and a case for failing on the first and second try.)

