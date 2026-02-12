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

- Each attempt has its own status (`Received`, `Initiated`, `Pending`, `Success`, `Failed`).
- Obligation status is derived from all attempts under the same `transactionReferenceId`:
  - If **any attempt succeeds** → obligation is **PAID**
  - Otherwise → obligation remains **OPEN**

Once PAID, further successful attempts for that `transactionReferenceId` are rejected.

---

This design separates **obligation identity** (`transactionReferenceId`) from **attempt identity** (`agencyTrackingId`), allowing safe retries while preventing duplicate payments.
