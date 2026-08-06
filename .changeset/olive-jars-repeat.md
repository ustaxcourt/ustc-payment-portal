---
"@ustaxcourt/payment-portal": patch
---

Block `POST /init` from minting a new checkout token when the `transactionReferenceId` has already been paid; previously a processed obligation could be re-initiated, allowing a customer to overpay.

- Extend `idx_transactions_unique_active` to include `processed`, so the database enforces at most one paid attempt per `(client_name, transaction_reference_id)` and the guard holds under concurrency.
- Add an already-paid guard to `initPayment` returning HTTP 409, replacing the misleading "in-flight" message a `pending` attempt previously received. A settled attempt returns `ConflictError.ALREADY_PAID_MESSAGE`; one still clearing returns `ConflictError.PAYMENT_SETTLING_MESSAGE`, which notes that ACH can take 1-2 business days.
- Distinguish a lost `createReceived` race from an already-paid obligation so overpayment attempts are no longer reported under the `persist_race` metric; adds the `already_paid` conflict reason.
- Scope `TransactionModel.findInFlightByReferenceId` by `clientName` to match the unique index, and reuse `findPendingOrProcessedByReferenceId` in `claimForProcessing` instead of a duplicated inline query.
