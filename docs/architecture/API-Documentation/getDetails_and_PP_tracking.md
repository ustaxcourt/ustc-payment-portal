# Transaction UUID → Payment Attempt Linkage (Metadata-Driven Obligations)

## Purpose

Payment Portal must support multiple payment attempts for the same obligation (e.g., retries), while ensuring the obligation is paid **at most once**. In the updated design, the client provides:

- a **unique UUID for each transaction attempt**
- a **metadata string** describing the *obligation* (e.g., feeType)

The UUID represents the **transaction attempt**, not the obligation.
The metadata represents the **obligation**, not the attempt.

Payment Portal uses metadata to group attempts, enforce correctness, and prevent double payment.

---

## Example Client Payload

```json
{
  "appId": "DAWSON",
  "transactionUUID": "550e8400-e29b-41d4-a716-446655440000",
  "urlSuccess": "https://client.app/success",
  "urlCancel": "https://client.app/cancel",
  "metadata": {
    "docketNumber": "123456",
    "petitionNumber": "PET-7890"
  }
}

## UUID & Metadata Semantics

### UUID
- The client generates a **new UUID for every initiated transaction**
- UUIDs are **never reused**, even for retries
- PP treats the UUID as an identifier for **one and only one attempt**

### Metadata
- Metadata identifies **the obligation being paid** (e.g., `"PETITION_FEE"`)
- Multiple attempts for the same obligation will share identical metadata
- Metadata must remain stable across retries

Together:

- **UUID = attempt ID**
- **Metadata = obligation descriptor**

---

## Core Relationship Model

- Each transaction attempt has a **unique UUID**
- Payment Portal uses **metadata** to determine which attempts belong to the same obligation
- Multiple attempts may share the same metadata, indicating retries

This allows PP to support unlimited retries without confusing them with different obligations.

---

## How Attempts Are Created and Linked

### Initial Attempt

When a payment is initiated:

1. Client sends:
   - a **fresh UUID** (attempt-level)
   - a **metadata string** (obligation-level)
2. Payment Portal creates a new payment attempt:
   - `attempt_uuid` = client UUID
   - `metadata` = what the user is paying for
   - `status = Pending`
3. If no obligation record exists for this metadata:
   - PP creates one implicitly

This links the attempt to its obligation via **metadata**, not UUID.

---

### Retry Attempts

On retry:

1. The client generates a **new UUID**
2. The client sends the **same metadata**
3. Payment Portal:
   - creates a new attempt
   - links it to the same obligation (matched by metadata)

Retries are detected because **metadata matches a previous attempt**.

---

## How Status Is Tracked

### Attempt-Level Status

Each UUID maps to an attempt with one of the internal states:

- `Pending`
- `Success`
- `Failed`

### Obligation-Level Status

The obligation status is derived from all attempts sharing the same metadata:

- If **any attempt is `Success`** → obligation is **PAID**
- If all attempts are `Failed` → obligation stays **OPEN**
- If any attempt is `Pending` → obligation stays **OPEN**

Once PAID:
- no further attempts may succeed
- PP may reject attempts with the same metadata

---

## getDetails and Retry Awareness

The `getDetails` API now:

- Accepts the **attempt UUID**
- Uses it to find the attempt → then its metadata → then the obligation
- Returns the **obligation status**, not just the attempt status

This gives the client a stable view of payment state without exposing internal linking logic.

---

## Why This Works

- UUIDs stay clean and single-purpose (one per attempt)
- Metadata acts as a natural grouping key
- PP, not the client, decides obligation lifecycle
- Retries are easy to track across separate UUIDs
- Duplicate payments are prevented through metadata grouping

---

## Contract Rules (Client Responsibilities)

- Every transaction attempt **must use a fresh UUID**
- Metadata must accurately describe the obligation
- Metadata **must stay consistent** across retries
- UUIDs must not encode meaning; PP treats them as opaque identifiers

Payment Portal will reject:
- attempts with conflicting metadata for an existing obligation
- attempts for obligations already marked PAID

---

## Summary

Payment Portal now relies on:

- **Client-provided UUIDs** to uniquely identify each individual payment attempt
- **Client-provided metadata** to identify and group attempts under the same obligation

This design cleanly separates *attempt identity* from *obligation identity*, enabling PP to support retries safely, prevent double payments, and maintain accurate obligation-level status tracking.

