# Payment Portal — Fee Determination & Authorization Architecture

## Overview

The Payment Portal is the authoritative system for initiating payment transactions with Pay.gov on behalf of client applications. This document defines how the Payment Portal determines fees, validates authorization, and constructs Pay.gov requests.

### Core Architectural Principle

**Clients provide fee identifiers and business context; the Payment Portal validates authorization and manages Pay.gov integration.**

Clients submit a `fee_key` (via the `fee` field in the API) to specify which fee they want to charge, along with metadata for audit purposes. The Payment Portal validates the fee exists, checks authorization, and constructs the Pay.gov request. The `fee_key` is resolved to the active fee version, which provides the `tcs_app_id` (a Pay.gov-provided identifier) and the fee amount.

**Fee Amount Determination:**
- **Fixed fees:** Amount is resolved from the Payment Portal's fees table (e.g., petition filing fee of $60)
- **Variable fees:** Amount is provided by the client and validated by the Payment Portal (e.g., payment for copies where quantity varies)

This design ensures:
- Clients explicitly declare payment intent via `fee_id`
- Authorization prevents clients from charging unauthorized fees
- Pay.gov identifiers (`tcs_app_id`) are abstracted from clients
- Variable fee amounts are validated before processing
- Consistent audit trail via metadata

---

## Terminology

- **`fee_key`** — Stable client-facing identifier for a fee type (e.g., `PETITION_FILING_FEE`). This is what clients send in the `fee` field of API requests. Shared across all versions of a fee.
- **`fee_id`** — Internal primary key for a specific fee version in the fees table. A new `fee_id` is created when a fee is updated (e.g., a price change). The `fee_id` is stored on each transaction to record exactly which fee version applied.
- **`tcs_app_id`** — Pay.gov application identifier (e.g., `TCSUSTAXCOURTANAEF`). Resolved from the active fee version using the `fee_key` provided by the client.
- **`activation_date`** — When a fee version becomes active. The Portal always uses the most recent version whose `activation_date` is in the past.
- **`is_variable`** — Boolean indicating if fee amount is client-provided (true) or portal-determined (false)
- **metadata** — Business context provided by clients to identify transaction type
- **Payment Portal (PP)** — This system

**Note:** Clients send `fee_key` → Portal resolves active fee version → Portal uses `tcs_app_id` and `amount` from that version when calling Pay.gov.

---

## Architecture Overview

### Request Processing Flow

```
1. Client Request (fee_key + metadata)
   ↓
2. Authorization Check (IAM role ARN + fee_key)
   ↓
3. Fee Lookup (fee_key → active fee version → tcs_app_id + is_variable + amount)
   ↓
4. Amount Resolution (fixed: use table, variable: use client amount)
   ↓
5. Pay.gov Request Construction (use tcs_app_id from lookup)
   ↓
6. Transaction Initiation (fee_id stored on transaction for audit/amount derivation)
```

Each stage is described in detail below.

---

## 1. Client Request Model

Clients initiate payments by submitting:

| Field | Description | Provided By | Required |
|-------|-------------|-------------|----------|
| `fee` | Fee key identifying the fee type to charge | Client | Always |
| `transactionReferenceId` | Client-assigned reference ID for this transaction | Client | Always |
| `urlSuccess` | Redirect URL after successful payment | Client | Always |
| `urlCancel` | Redirect URL if payment is cancelled | Client | Always |
| `metadata` | Business context for audit/reporting | Client | Always |
| `amount` | Payment amount (only for variable fees) | Client | Variable fees only |

**Note:** The Payment Portal generates the `agency_tracking_id` (used in Pay.gov requests) internally. Clients do not provide this value.

**Example Request (Fixed Fee):**

```json
{
  "fee": "PETITION_FILING_FEE",
  "transactionReferenceId": "TXREF-00001",
  "urlSuccess": "https://dawson.ustaxcourt.gov/payment/success",
  "urlCancel": "https://dawson.ustaxcourt.gov/payment/cancel",
  "metadata": {
    "docketNumber": "12345-26",
    "petitionNumber": "PET-7890"
  }
}
```

**Example Request (Variable Fee):**

```json
{
  "fee": "COPY_REQUEST",
  "transactionReferenceId": "TXREF-00002",
  "urlSuccess": "https://dawson.ustaxcourt.gov/payment/success",
  "urlCancel": "https://dawson.ustaxcourt.gov/payment/cancel",
  "amount": 45.00,
  "metadata": {
    "copyRequestId": "COPY-2026-001",
    "numberOfPages": 150
  }
}
```

**Critical Constraints:**
- Clients must provide `fee` (the fee key) to specify which fee to charge
- The fee key must match an active fee version in the fees table
- The portal resolves the active fee version using the client-provided fee key, then uses its `tcs_app_id` and `amount`
- Clients provide `amount` only for variable fees; for fixed fees, amount is resolved from the fees table
- If `amount` is provided for a fixed fee, the request fails with `400 Bad Request`
- If `amount` is missing for a variable fee, request fails with `400 Bad Request`
- If the fee key is invalid, request fails with `400 Bad Request`

---

## 2. Fee Validation

The Payment Portal validates that the client-provided `fee_id` corresponds to an active fee in the system.

### Validation Steps

1. **Schema Validation** — Verify `fee` (fee key) is present and non-empty
2. **Authorization Check** — Verify the client's IAM role is permitted to charge this fee key
3. **Existence Check** — Query fees table to confirm an active fee version exists for the key
4. **Variable Fee Amount Check** — If fee is variable, validate `amount` field is present and positive

### Implementation Notes

- Logic resides in: `src/useCases/initPayment.ts`
- Authorization is checked before the fee lookup
- Invalid fee key results in early rejection to avoid unnecessary processing
- Metadata is stored for audit purposes but not used for fee determination

### Error Handling

| Condition | HTTP Status | Error Code | Message  |
|-----------|-------------|------------|----------|
| `fee` missing | 400 | `INVALID_REQUEST` | fee is required |
| Fee key not found | 400 | `FEE_NOT_FOUND` | Fee type is not available |
| Variable fee, amount missing | 400 | `AMOUNT_REQUIRED` | Amount is required for variable fees |

---

## 3. Fee Configuration & Lookup

Once `fee_id` is determined, the Payment Portal queries the `fees` table to resolve the Pay.gov configuration and amount.

### Fees Table Schema

```sql
CREATE TABLE fees (
  fee_id          VARCHAR(50) PRIMARY KEY,   -- Version-specific identifier (stored on transactions)
  fee_key         VARCHAR(100) NOT NULL,      -- Stable client-facing identifier, shared across versions
  name            VARCHAR(100) NOT NULL,      -- Human-readable fee name, useful for finance dashboard
  tcs_app_id      VARCHAR(50) NOT NULL,       -- Pay.gov application identifier
  is_variable     BOOLEAN NOT NULL DEFAULT false,
  amount          DECIMAL(10,2),              -- Required when is_variable = false, NULL when is_variable = true
  description     TEXT NOT NULL,
  activation_date TIMESTAMP NOT NULL,         -- When this fee version becomes active
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**Example Data:**

| fee_id | fee_key | name | tcs_app_id | is_variable | amount | activation_date |
|--------|---------|------|------------|-------------|--------|-----------------|
| PETITION_FILING_FEE | PETITION_FILING_FEE | Petition Filing | TCSUSTAXCOURTPETITION | false | 60.00 | 2026-03-05 |
| NONATTORNEY_EXAM_REGISTRATION_FEE | NONATTORNEY_EXAM_REGISTRATION_FEE | Admission Exam | TCSUSTAXCOURTANAEF | false | 250.00 | 2026-03-05 |

**Note:** Clients send `fee_key` via the `fee` field. The `fee_id` stored on a transaction identifies the exact fee version that was active at initiation — this is how `transactionAmount` is derived for the dashboard without storing it per transaction.

### Lookup Query

```sql
SELECT fee_id, fee_key, name, tcs_app_id, is_variable, amount
FROM fees
WHERE fee_key = :fee_key
  AND activation_date <= NOW()
ORDER BY activation_date DESC
LIMIT 1;
```

**Note:** The `tcs_app_id` and `amount` from this query are used when constructing the Pay.gov API request. The `fee_id` is stored on the transaction record.

### Amount Resolution Logic

**For fixed fees (is_variable = false):**
- Use `amount` from fees table
- Ignore any client-provided amount

**For variable fees (is_variable = true):**
- Require client to provide `amount` in request
- Validate amount is positive and within reasonable bounds
- Use client-provided amount for Pay.gov request

### Error Handling

| Condition | HTTP Status | Error Code | Message  |
|-----------|-------------|------------|----------|
| Fee not found | 400 | `FEE_NOT_FOUND` | Fee type is not available |
| Variable fee, amount missing | 400 | `AMOUNT_REQUIRED` | Amount is required for variable fees |
| Variable fee, invalid amount | 400 | `INVALID_AMOUNT` | Amount must be positive |

---

## 4. Authorization Model

After resolving the fee configuration, the Payment Portal validates that the requesting client is authorized to charge that fee.

Client permissions are stored in the `ustc/pay-gov/{env}/client-permissions` secret in AWS Secrets Manager — not a database table. Each entry maps a client's IAM role ARN to the fee IDs they are permitted to charge:

```json
[
  {
    "clientName": "DAWSON",
    "clientRoleArn": "arn:aws:iam::111111111111:role/dawson-client",
    "allowedFeeKeys": ["PETITION_FILING_FEE"]
  }
]
```

The Lambda checks the caller's IAM role ARN (extracted from the API Gateway request context) against this secret on every request. See [client-onboarding.md](../../client-onboarding.md#permitting-apps-to-charge-specific-fees) for operational steps to grant or revoke fee access.

### Authorization Decision

| Condition | Result | HTTP Response |
| --------- | ------ | ------------- |
| Role ARN found, fee key in `allowedFeeKeys` | Authorized | Continue processing |
| Role ARN found, fee key not in `allowedFeeKeys` | Not authorized | `403 Forbidden` — `"Client not authorized for fee key"` |
| Role ARN not found | Not registered | `403 Forbidden` — `"Client not registered"` |

---

## 5. Pay.gov Request Construction

After authorization is confirmed, the Payment Portal constructs the SOAP request to Pay.gov.

### Request Payload

| Field | Source | Example |
|-------|--------|---------|
| `tcs_app_id` | From fees table lookup | `TCSUSTAXCOURTPETITION` |
| `agency_tracking_id` | Generated by Payment Portal (UUID) | `550e8400-...` |
| `transaction_amount` | Fees table (fixed) OR client request (variable) | `60.00` |

```xml
<startOnlineCollection>
  <tcs_app_id>TCSUSTAXCOURTPETITION</tcs_app_id>
  <agency_tracking_id>550e8400-e29b-41d4-a716-446655440000</agency_tracking_id>
  <transaction_amount>60.00</transaction_amount>
  <url_success>https://dawson.ustaxcourt.gov/payment/success</url_success>
  <url_cancel>https://dawson.ustaxcourt.gov/payment/cancel</url_cancel>
</startOnlineCollection>
```

### Data Flow Summary

**Fixed Fee Flow:**
```
Client Provides:    fee_key, transactionReferenceId, metadata, redirects
      ↓
PP Authorizes:      (IAM role ARN, fee_key) relationship
      ↓
PP Looks Up:        active fee version by fee_key → tcs_app_id, is_variable=false, amount
      ↓
PP Records:         transaction with fee_id (version) for audit/amount derivation
      ↓
PP Sends to Pay.gov: tcs_app_id (from lookup), amount (from fee version), redirects
```

**Variable Fee Flow:**
```
Client Provides:    fee_key, transactionReferenceId, amount, metadata, redirects
      ↓
PP Authorizes:      (IAM role ARN, fee_key) relationship
      ↓
PP Validates:       amount > 0
      ↓
PP Looks Up:        active fee version by fee_key → tcs_app_id, is_variable=true
      ↓
PP Records:         transaction with fee_id (version) for audit
      ↓
PP Sends to Pay.gov: tcs_app_id (from lookup), amount (from client), redirects
```

---

## 6. Data Governance

### Fee Management

**Who Owns Fee Data:**
- Fees table is owned by the Payment Portal database
- Fee definitions are managed through database migrations (production/staging) or direct SQL (development only)

**Fee Update Process:**

For **production and staging** (required):
1. Create database migration file with new/updated fee data
2. Update fee determination logic if new metadata patterns are needed
3. Submit pull request with migration + code changes
4. Deploy to environments (dev → staging → production)
5. Verify migration applied successfully in each environment

For **local development** (acceptable for testing):
- Direct SQL: `INSERT INTO fees (fee_id, name, tcs_app_id, is_variable, amount, description) VALUES (...)`
- Must still create migration before merging to main branch

**Why migrations for production:**
- Audit trail for financial system compliance
- Reproducibility across environments
- Rollback capability
- Version control and team visibility
- Prevents configuration drift

**Versioning Strategy:**
- Fee amounts are versioned via the `fee_key` / `fee_id` split. A new fee row is inserted with a new `fee_id`, the same `fee_key`, and a future `activation_date`. The Portal always resolves the most recent active version. Transactions store the `fee_id` of the version that was active at initiation, so the dashboard can derive the correct `transactionAmount` via a join without storing it per transaction.

### Authorization Management

**Who Owns Authorization Data:**

- Client permissions are managed by the Payment Portal team via the `ustc/pay-gov/{env}/client-permissions` secret in AWS Secrets Manager

**Adding Client Authorization:**

Update the secret to add the client's IAM role ARN and allowed fee keys. No deployment required — Lambda picks up changes after the 5-minute cache TTL. See [client-onboarding.md](../../client-onboarding.md#permitting-apps-to-charge-specific-fees) for the full runbook.

---

## 7. Adding a New Fee

### Step-by-Step Process

**1. Create Fee Definition**

Add the new fee to `db/seeds/data/fees.ts` and re-run the seed, or write a migration for production:

```typescript
// In db/seeds/data/fees.ts — add to the fees array:
{
  fee_id: 'NEW_FIXED_FEE_V1',          // unique version identifier
  fee_key: 'NEW_FIXED_FEE',            // stable client-facing key
  name: 'New Application Fee',
  tcs_app_id: 'TCSUSTAXCOURTNEWAPP',
  is_variable: false,
  amount: 100.00,
  description: 'New Fixed Fee Description',
  activation_date: '2026-06-01T00:00:00Z',
}
```

To update an existing fee's amount, insert a new row with the same `fee_key`, a new `fee_id`, and a future `activation_date` — do not update the existing row.

**Important:** The `tcs_app_id` value must match the TCS application configured in Pay.gov.

**2. Update API Documentation**

Add the new `fee_id` to your API documentation and client SDKs so clients know it's available.

**3. Configure Client Authorization**

Update the `ustc/pay-gov/{env}/client-permissions` secret in Secrets Manager to add the new fee key to each client's `allowedFeeKeys` that needs access. No deployment required — Lambda picks up the change after the 5-minute cache TTL. See [client-onboarding.md](../../client-onboarding.md#permitting-apps-to-charge-specific-fees) for the full runbook.

**4. Configure Pay.gov**

Coordinate with your Pay.gov liaison to set up a new TCS application. This requires:
- Contacting the Pay.gov liaison to request a new TCS application
- Requesting a new TCS application ID (e.g., `TCSUSTAXCOURTNEWAPP`)
- Providing fee details (name, amount if fixed, description)
- Confirming the TCS application is active before deploying code that uses it

**Important:** The `tcs_app_id` value in your fees table must exactly match the TCS application ID provided by Pay.gov.

**5. Deploy**

Deploy code changes and run migrations in each environment.

---

## 8. Architecture Guarantees

This design provides the following guarantees:

| Guarantee | Enforcement Mechanism |
|-----------|----------------------|
| Clients cannot manipulate fixed fee amounts | Fixed amounts resolved from active fee version only; not stored per transaction |
| Variable fee amounts are validated | Amount presence and positivity checks for variable fees |
| Clients cannot select unauthorized fees | Secrets Manager `client-permissions` enforces IAM role ARN → allowed fee key relationship |
| Fee keys are validated | fee_key must match an active fee version in the fees table |
| Pay.gov identifiers are abstracted | Clients use fee_key; portal looks up tcs_app_id from active fee version |
| Historical amounts are auditable | Transactions store fee_id (version); amount derivable at any time via join |

---

## 9. Error Reference

| Error Code | HTTP Status | Description | Client Action |
|------------|-------------|-------------|---------------|
| `FEE_NOT_FOUND` | 400 | No active fee version exists for the supplied fee key | Verify the `fee` field value is correct |
| `AMOUNT_REQUIRED` | 400 | Variable fee requires amount in request | Add `amount` field to request |
| `INVALID_AMOUNT` | 400 | Amount is zero, negative, or invalid format | Provide positive decimal amount |
| `UNAUTHORIZED_FEE` | 403 | Client not authorized for this fee key | Request authorization via onboarding |
| `INVALID_REQUEST` | 400 | Schema validation failure | Fix request format |
| `PAY_GOV_ERROR` | 500 | Pay.gov responded but result could not be processed | Retry later |
| `PAY_GOV_ERROR` | 502 | Pay.gov's response was invalid or malformed | Retry later
| `PAY_GOV_ERROR` | 504 | Could not reach Pay.gov | Retry later |


---


