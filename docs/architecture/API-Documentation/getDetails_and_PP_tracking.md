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

When `/process` is retried for a stale `processing` attempt with a stored
Pay.gov tracking ID, PP calls Pay.gov's `getDetails` before attempting completion
again. If Pay.gov reports `Success`, PP records the processed result and returns
the normal successful `/process` response, including the attempt summaries.
This recovery also works after the original token expires. A failed details
lookup leaves the attempt unchanged and propagates the error; a non-success
status continues through the existing claim and token validation.

---

This design separates **obligation identity** (`transactionReferenceId`) from **attempt identity** (`agencyTrackingId`), allowing safe retries while preventing duplicate payments.
