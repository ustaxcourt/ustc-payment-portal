# Transaction Reference ID → Payment Attempt Linkage

## Purpose

Payment Portal must support payment retries while ensuring that a single business obligation is paid **at most once**. To accomplish this, PP relies on a **client-provided `transaction_reference_id` (UUID)** to represent the obligation and explicitly links all payment attempts to it.

This allows PP to associate multiple retries with the same obligation while keeping payment attempts distinct.

---

## Transaction Reference ID Ownership & Semantics

- `transaction_reference_id` is **provided by the client** as a UUID
- The identifier represents the **business obligation**, not a single payment attempt
- The same `transaction_reference_id` **must be reused across retries**

While the client provides the identifier, **Payment Portal owns the enforcement of payment correctness and lifecycle rules**.

---

## Core Relationship Model

- `transaction_reference_id` identifies **what is being paid**
- Each `attempt_id` represents **one attempt**
- All retries reference the same UUID

---

## How Attempts Are Created and Linked

### Initial Attempt

When a payment is initiated:

1. Client supplies a `transaction_reference_id` (UUID)
2. Payment Portal creates an obligation record if one does not already exist
3. The first payment attempt is created with:
   - `attempt_id`
   - `transaction_reference_id`
   - initial status = `Pending`

> Note: `Pending` represents the initial Pay.gov-facing state. Any internal pre-processing state (e.g., request validation or token creation) is transient and not exposed as a durable attempt status.

This establishes the obligation → attempt relationship.

---

### Retry Attempts

If an attempt fails, expires, or is abandoned:

1. Client reuses the same `transaction_reference_id`
2. Payment Portal **does not create a new obligation**
3. A new payment attempt is created and linked to the existing obligation

Retries are therefore explicitly grouped under the same obligation.

---

## How Status Is Tracked

### Attempt-Level Status (Pay.gov → PP Mapping)

Payment Portal normalizes Pay.gov statuses into three internal attempt states.

#### Pending

Any of the following Pay.gov statuses map to **`Pending`**:
- `Pending`
- `Received`
- `Waiting`
- `Submitted`

These indicate the payment has been initiated or is still being processed.

#### Success

Any of the following Pay.gov statuses map to **`Success`**:
- `Settled`
- `Success`

These indicate the payment has completed successfully.

#### Failed

Any of the following Pay.gov statuses map to **`Failed`**:
- `Cancelled`
- `Failed`
- `Retired`

These indicate the payment attempt did not complete successfully.

---

### Obligation-Level Status

The obligation status is derived from its associated attempts:

- If **any attempt reaches `Success`** → obligation becomes **PAID**
- If all attempts are `Failed` → obligation remains **OPEN**
- If any attempt is `Pending` → obligation remains **OPEN**

Once an obligation is PAID:
- no new attempts may be created
- existing attempts cannot transition to `Success`

---

## getDetails and Retry Awareness

The `getDetails` API uses `transaction_reference_id` to:

1. Locate the obligation
2. Inspect all associated attempts
3. Determine the authoritative obligation status
4. Return a single, stable result to the client

Clients never reference:
- individual attempt IDs
- Pay.gov tracking IDs
- processor-specific identifiers

---

## Why This Works

- Clients control obligation identity, but PP controls correctness
- Retries are first-class and explicitly linked
- Duplicate payments are prevented
- Payment history is auditable and explainable

---

## Contract Rules (Client Responsibilities)

- A `transaction_reference_id` **must uniquely identify one obligation per app**
- The same `transaction_reference_id` **must not be reused** for different fee types or amounts
- If a `transaction_reference_id` is reused, the following fields must remain immutable **as originally recorded on first use**:
  - `feeType`
  - `amount`
- Payment Portal will reject requests that violate these constraints

---

## Summary

By requiring the client to provide a stable `transaction_reference_id` (UUID) and linking all payment attempts to it, Payment Portal can reliably track retries and enforce that each obligation is paid at most once. This design preserves a clean client contract while allowing PP to manage payment integrity and retries.
