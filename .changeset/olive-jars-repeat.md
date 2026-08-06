---
"@ustaxcourt/payment-portal": patch
---

Block `POST /init` from minting a new checkout token when the `transactionReferenceId` has already been paid; previously a processed obligation could be re-initiated, allowing a customer to overpay.

- Extend `idx_transactions_unique_active` to include `processed`, so the database enforces at most one paid attempt per `(client_name, transaction_reference_id)` and the guard holds under concurrency.
- Add an `alreadyPaid` guard to `initPayment` returning HTTP 409 with `ConflictError.ALREADY_PAID_MESSAGE`; a `pending` attempt now returns this instead of a misleading "in-flight" message.
- Distinguish a lost `createReceived` race from an already-paid obligation so overpayment attempts are no longer reported under the `persist_race` metric; adds the `already_paid` conflict reason.
- Scope `TransactionModel.findInFlightByReferenceId` by `clientName` to match the unique index, and reuse `findPendingOrProcessedByReferenceId` in `claimForProcessing` instead of a duplicated inline query.
