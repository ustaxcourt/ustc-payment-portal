# Payment Portal — Fee Determination & Authorization Architecture

## Overview

The Payment Portal is the authoritative system for initiating payment transactions with Pay.gov on behalf of client applications. This document defines how the Payment Portal determines fees, validates authorization, and constructs Pay.gov requests.

### Core Architectural Principle

**Clients provide fee identifiers and business context; the Payment Portal validates authorization and manages Pay.gov integration.**

Clients submit a `fee_id` to specify which fee they want to charge, along with metadata for audit purposes. The Payment Portal validates the fee exists, checks authorization, and constructs the Pay.gov request. The `fee_id` is mapped to a `tcs_app_id` (a Pay.gov-provided identifier) via the fees table, which is used when calling Pay.gov's API.

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

- **`fee_id`** — Client-facing identifier for a fee type (e.g., `PETITION_FILING_FEE`, `NONATTORNEY_EXAM_REGISTRATION_FEE`). This is what clients send in API requests
- **`tcs_app_id`** — Pay.gov application identifier (e.g., `TCSUSTAXCOURTANAEF`). We look this up from the fees table using the `fee_id` provided by the client
- **`is_variable`** — Boolean indicating if fee amount is client-provided (true) or portal-determined (false)
- **metadata** — Business context provided by clients to identify transaction type
- **Payment Portal (PP)** — This system

**Note:** Clients send `fee_id` → Portal looks up `tcs_app_id` from database → Portal uses `tcs_app_id` when calling Pay.gov.

---

## Architecture Overview

### Request Processing Flow

```
1. Client Request (fee_id + metadata)
   ↓
2. Fee Validation (fee_id exists?)
   ↓
3. Authorization Check (IAM role ARN + fee_id)
   ↓
4. Fee Lookup (fee_id → tcs_app_id + is_variable + amount)
   ↓
5. Amount Resolution (fixed: use table, variable: use client amount)
   ↓
6. Pay.gov Request Construction (use tcs_app_id from lookup)
   ↓
7. Transaction Initiation
```

Each stage is described in detail below.

---

## 1. Client Request Model

Clients initiate payments by submitting:

| Field | Description | Provided By | Required |
|-------|-------------|-------------|----------|
| `fee_id` | Fee type identifier | Client | Always |
| `urlSuccess` | Redirect URL after successful payment | Client | Always |
| `urlCancel` | Redirect URL if payment is cancelled | Client | Always |
| `metadata` | Business context for audit/reporting | Client | Always |
| `amount` | Payment amount (only for variable fees) | Client | Variable fees only |

**Note:** The Payment Portal generates the `agency_tracking_id` (used in Pay.gov requests) internally. Clients do not provide this value.

**Example Request (Fixed Fee):**

```json
{
  "fee_id": "PETITION_FILING_FEE",
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
  "fee_id": "COPY_REQUEST",
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
- Clients must provide `fee_id` to specify which fee to charge
- The `fee_id` must match a valid fee in the fees table
- The portal looks up the `tcs_app_id` from the fees table using the client-provided `fee_id`
- Clients provide `amount` only for variable fees; for fixed fees, amount is resolved from the fees table
- If `amount` is provided for a fixed fee, it is ignored
- If `amount` is missing for a variable fee, request fails with `400 Bad Request`
- If `fee_id` is invalid, request fails with `400 Bad Request`

---

## 2. Fee Validation

The Payment Portal validates that the client-provided `fee_id` corresponds to an active fee in the system.

### Validation Steps

1. **Schema Validation** — Verify `fee_id` is present and non-empty
2. **Existence Check** — Query fees table to confirm fee exists
3. **Variable Fee Amount Check** — If fee is variable, validate `amount` field is present and positive

### Implementation Notes

- Logic resides in: `src/useCases/initPayment.ts`
- Validation occurs before any authorization checks
- Invalid `fee_id` results in early rejection to avoid unnecessary processing
- Metadata is stored for audit purposes but not used for fee determination

### Error Handling

| Condition | HTTP Status | Error Code | Message  |
|-----------|-------------|------------|----------|
| `fee_id` missing | 400 | `INVALID_REQUEST` | fee_id is required |
| `fee_id` not found | 400 | `FEE_NOT_FOUND` | Fee type is not available |
| Variable fee, amount missing | 400 | `AMOUNT_REQUIRED` | Amount is required for variable fees |

---

## 3. Fee Configuration & Lookup

Once `fee_id` is determined, the Payment Portal queries the `fees` table to resolve the Pay.gov configuration and amount.

### Fees Table Schema

```sql
CREATE TABLE fees (
  fee_id          VARCHAR(50) PRIMARY KEY,   -- Client-facing fee identifier
  name            VARCHAR(100) NOT NULL,      -- Human-readable fee name, useful for finance dashboard
  tcs_app_id      VARCHAR(50) NOT NULL,       -- Pay.gov application identifier
  is_variable     BOOLEAN NOT NULL DEFAULT false,
  amount          DECIMAL(10,2),  -- Required when is_variable = false, NULL when is_variable = true
  description     TEXT NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**Example Data:**

| fee_id | name | tcs_app_id | is_variable | amount | description |
|--------|------|------------|-------------|--------|-------------|
| PETITION_FILING_FEE | Petition Filing | TCSUSTAXCOURTPETITION | false | 60.00 | Petition Filing Fee |
| COPY_REQUEST | Document Copies | TCSUSTAXCOURTCOPY | true | NULL | Document Copy Request (varies by page count) |
| NONATTORNEY_EXAM_REGISTRATION_FEE | Admission Exam | TCSUSTAXCOURTANAEF | false | 250.00 | Non-Attorney Exam Registration |

**Note:** The `fee_id` is what clients send in their API requests. The `tcs_app_id` is the Pay.gov identifier that we use when calling Pay.gov's API.

### Lookup Query

```sql
SELECT fee_id, name, tcs_app_id, is_variable, amount, description
FROM fees
WHERE fee_id = :fee_id;
```

**Note:** The `tcs_app_id` from this query is used when constructing the Pay.gov API request.

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
    "allowedFeeIds": ["PETITION_FILING_FEE"]
  }
]
```

The Lambda checks the caller's IAM role ARN (extracted from the API Gateway request context) against this secret on every request. See [client-onboarding.md](../../client-onboarding.md#permitting-apps-to-charge-specific-fees) for operational steps to grant or revoke fee access.

### Authorization Decision

| Condition | Result | HTTP Response |
| --------- | ------ | ------------- |
| Role ARN found, fee ID in `allowedFeeIds` | Authorized | Continue processing |
| Role ARN found, fee ID not in `allowedFeeIds` | Not authorized | `403 Forbidden` — `"Client not authorized for feeId"` |
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
Client Provides:    fee_id, metadata, redirects
      ↓
PP Validates:       fee_id exists
      ↓
PP Authorizes:      (IAM role ARN, fee_id) relationship
      ↓
PP Looks Up:        tcs_app_id, is_variable=false, amount (from fees table)
      ↓
PP Sends to Pay.gov: tcs_app_id (from lookup), amount (from table), redirects
```

**Variable Fee Flow:**
```
Client Provides:    fee_id, amount, metadata, redirects
      ↓
PP Validates:       fee_id exists, amount > 0
      ↓
PP Authorizes:      (IAM role ARN, fee_id) relationship
      ↓
PP Looks Up:        tcs_app_id, is_variable=true (from fees table)
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
- Fee amounts are not currently versioned

### Authorization Management

**Who Owns Authorization Data:**

- Client permissions are managed by the Payment Portal team via the `ustc/pay-gov/{env}/client-permissions` secret in AWS Secrets Manager

**Adding Client Authorization:**

Update the secret to add the client's IAM role ARN and allowed fee IDs. No deployment required — Lambda picks up changes after the 5-minute cache TTL. See [client-onboarding.md](../../client-onboarding.md#permitting-apps-to-charge-specific-fees) for the full runbook.

---

## 7. Adding a New Fee

### Step-by-Step Process

**1. Create Fee Definition**

```sql
-- Fixed fee example
INSERT INTO fees (fee_id, name, tcs_app_id, is_variable, amount, description)
VALUES ('NEW_FIXED_FEE', 'New Application Fee', 'TCSUSTAXCOURTNEWAPP', false, 100.00, 'New Fixed Fee Description');

-- Variable fee example
INSERT INTO fees (fee_id, name, tcs_app_id, is_variable, amount, description)
VALUES ('NEW_VARIABLE_FEE', 'Variable Service Fee', 'TCSUSTAXCOURTVARAPP', true, NULL, 'New Variable Fee Description');
```

**Important:** The `tcs_app_id` value must match the TCS application configured in Pay.gov.

**2. Update API Documentation**

Add the new `fee_id` to your API documentation and client SDKs so clients know it's available.

**3. Configure Client Authorization**

Update the `ustc/pay-gov/{env}/client-permissions` secret in Secrets Manager to add the new `fee_id` to each client's `allowedFeeIds` that needs access. No deployment required — Lambda picks up the change after the 5-minute cache TTL. See [client-onboarding.md](../../client-onboarding.md#permitting-apps-to-charge-specific-fees) for the full runbook.

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
| Clients cannot manipulate fixed fee amounts | Fixed amounts resolved from fees table only |
| Variable fee amounts are validated | Amount presence and positivity checks for variable fees |
| Clients cannot select unauthorized fees | Secrets Manager `client-permissions` enforces IAM role ARN → allowed fee ID relationship |
| Fee identifiers are validated | fee_id must exist in fees table |
| Pay.gov identifiers are abstracted | Clients use fee_id; portal looks up tcs_app_id from database |
| Authorization is auditable | All checks logged with context including amounts |

---

## 9. Error Reference

| Error Code | HTTP Status | Description | Client Action |
|------------|-------------|-------------|---------------|
| `FEE_NOT_FOUND` | 400 | Fee does not exist | Verify fee_id is correct |
| `AMOUNT_REQUIRED` | 400 | Variable fee requires amount in request | Add amount field to request |
| `INVALID_AMOUNT` | 400 | Amount is zero, negative, or invalid format | Provide positive decimal amount |
| `UNAUTHORIZED_FEE` | 403 | Client not authorized for this fee | Request authorization |
| `INVALID_REQUEST` | 400 | Schema validation failure | Fix request format |
| `PAY_GOV_ERROR` | 502 | Pay.gov integration failure | Retry later |

---


