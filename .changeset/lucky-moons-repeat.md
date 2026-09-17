---
"@ustaxcourt/payment-portal": minor
---

`TransactionStatus` gains a terminal `cancelled` value. An `initiated` transaction whose Pay.gov token has outlived its three-hour TTL now resolves to `transactionStatus: 'cancelled'` with `paymentStatus: 'failed'`, rather than remaining `initiated` / `pending` indefinitely. Nothing failed — the payer never completed the hosted collection session — so cancelled rows carry no `returnCode` or `returnDetail`.

Consumers that switch on `transactionStatus` should handle `cancelled`; those reading `paymentStatus` are unaffected, since a cancelled attempt resolves to `failed` like any other unsuccessful obligation. `GET /details` reports a cancelled-only obligation as `failed` and no longer refreshes it against Pay.gov.

Cancellation happens on the next `POST /init` for the same obligation, or through a scheduled sweep. Cancelling releases the `transaction_reference_id`, so a payer who abandoned a session can start a new attempt.
