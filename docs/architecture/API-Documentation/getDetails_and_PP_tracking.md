**PREFACE: THE FOLLOWING DESCRIBES THE UPCOMING PAYMENT PORTAL DESIGN. THIS IMPLEMENTATION IS PLANNED AND NOT YET LIVE.**

## Transaction & Attempt Model

Payment Portal (PP) supports multiple payment attempts for the same obligation while ensuring the obligation is paid **at most once**.

### Client Provides
- `transactionReferenceId` (unique per obligation)
- `metadata` (describes the obligation)

### PP Generates
- `agencyTrackingId` (unique per attempt)

---

## Core Behavior

- `transactionReferenceId` represents the obligation being paid.
- Multiple attempts may exist for the same `transactionReferenceId`.
- Each attempt receives a unique `agencyTrackingId`.
- `metadata` must remain consistent for a given `transactionReferenceId`.

---

## Status Rules

- Each attempt has its own status (`Received`, `Initiated`, `Pending`, `Completed`).
- Each attempt keeps track of the payment status as reported by Pay.gov's `transaction_status` (`Pending`, `Success`, `Failed`)
- Obligation status is derived from all attempts under the same `transactionReferenceId`:
  - If **any attempt succeeds** → obligation is **PAID**
  - Otherwise → obligation remains **OPEN**

Once PAID, further successful attempts for that `transactionReferenceId` are rejected.

### Recovering a timed-out completion

Both `/init` and `/process` reconcile stale `processing` attempts through
Pay.gov's `getDetails` when a tracking ID is available:

- `Success` or `Settled`: record the processed result. `/process` returns its
  normal success response, even after token expiration; `/init` returns HTTP 400
  without opening a new session, as required by PAY-421. Settling payments still
  return HTTP 409 from `/init`.
- `Pending`, `Received`, `Waiting`, or `Submitted`: record a pending result.
  `/process` returns pending without completing the token again; `/init` rejects
  a new session with the payment-settling message.
- A confirmed failure allows `/init` to fail the old attempt and open a new session.
  `/process` retains its existing claim and token validation for this outcome.

Reconciliation writes atomically match the observed status and full-precision
update timestamp. A concurrent claim or result produces a conflict instead of
overwriting the newer state. `failObservedProcessing` names this snapshot check;
`updateToFailed` separately refuses to overwrite processed or pending attempts.
`/init` rejects a different fee only when reusing a token or reconciling the
existing attempt, and uses the stored attempt's fee version for Pay.gov lookups.
An expired initiated session is cancelled before allowing a different fee.

If there is no tracking ID, both endpoints return a conflict and block retries
until the outcome can be confirmed. A Lambda timeout before the completion result
was stored can cause this condition; it requires support reconciliation rather
than assuming the payment failed. A failed or malformed details lookup returns
a retryable gateway error without changing the attempt.

The current SOAP client uses `paygov_tracking_id` for `getDetails`. Support for
an `agency_tracking_id` request field has not been verified against an official
Pay.gov schema, so the portal does not send that unverified field. Automatic
recovery for a timeout before the tracking ID was stored remains blocked pending
that confirmation. These retries emit `PaymentOutcomeUnknown`; the matching
critical alarm pages support on the first event. The cancellation sweep also
counts stale `processing` attempts with no tracking ID and emits this metric
without changing those attempts, so detection does not depend on a retry.
Proactive detection requires the sweep schedule to be enabled. See the
[unknown-outcome runbook](../../runbooks/lambda-error-alerts.md#unknown-payment-outcomes).

---

This design separates **obligation identity** (`transactionReferenceId`) from **attempt identity** (`agencyTrackingId`), allowing safe retries while preventing duplicate payments.
