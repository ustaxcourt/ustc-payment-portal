# Payment Portal — Fee Determination & Authorization Architecture

## Overview

The Payment Portal is the authoritative system for initiating payment transactions with Pay.gov on behalf of client applications. This document defines how the Payment Portal determines fees, validates authorization, and constructs Pay.gov requests.

### Core Architectural Principle

**Clients provide fee identifiers and business context; the Payment Portal validates authorization and manages Pay.gov integration.**

Clients submit a `fee_id` to specify which fee they want to charge, along with metadata for audit purposes. The Payment Portal validates the fee exists, checks authorization, and constructs the Pay.gov request.

**Fee Amount Determination:**
- **Fixed fees:** Amount is resolved from the Payment Portal's fees table (e.g., petition filing fee of $60)
- **Variable fees:** Amount is provided by the client and validated by the Payment Portal (e.g., payment for copies where quantity varies)

**Critical Constraint:** Clients never provide `tcs_app_id` — this is always derived from the fee configuration.

This design ensures:
- Clients explicitly declare payment intent via `fee_id`
- Authorization prevents clients from charging unauthorized fees
- Pay.gov integration details remain abstracted
- Variable fee amounts are validated before processing
- Consistent audit trail via metadata

---

## Terminology

- **`app_id`** — Identifier for a client application (e.g., `DAWSON`)
- **`fee_id`** — Internal identifier for a fee type (e.g., `PETITION_FILING`)
- **`tcs_app_id`** — Pay.gov application identifier
- **`is_variable`** — Boolean indicating if fee amount is client-provided (true) or portal-determined (false)
- **metadata** — Business context provided by clients to identify transaction type
- **Payment Portal (PP)** — This system

---

## Architecture Overview

### Request Processing Flow

```
1. Client Request (fee_id + app_id + metadata)
   ↓
2. Fee Validation (fee_id exists and active?)
   ↓
3. Fee Lookup (fee_id → tcs_app_id + is_variable + amount)
   ↓
4. Authorization Check (app_id + tcs_app_id)
   ↓
5. Amount Resolution (fixed: use table, variable: use client amount)
   ↓
6. Pay.gov Request Construction
   ↓
7. Transaction Initiation
```

Each stage is described in detail below.

---

## 1. Client Request Model

Clients initiate payments by submitting:

| Field | Description | Provided By | Required |
|-------|-------------|-------------|----------|
| `app_id` | Client application identifier | Client | Always |
| `fee_id` | Fee type identifier | Client | Always |
| `transactionReferenceId` | Client-generated UUID for idempotency | Client | Always |
| `urlSuccess` | Redirect URL after successful payment | Client | Always |
| `urlCancel` | Redirect URL if payment is cancelled | Client | Always |
| `metadata` | Business context for audit/reporting | Client | Always |
| `amount` | Payment amount (only for variable fees) | Client | Variable fees only |

**Example Request (Fixed Fee):**

```json
{
  "app_id": "DAWSON",
  "fee_id": "PETITION_FILING",
  "transactionReferenceId": "550e8400-e29b-41d4-a716-446655440000",
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
  "app_id": "DAWSON",
  "fee_id": "COPY_REQUEST",
  "transactionReferenceId": "550e8400-e29b-41d4-a716-446655440000",
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
- Clients never provide `tcs_app_id` — this is always resolved from the fee configuration
- Clients provide `amount` only for variable fees; for fixed fees, amount is resolved from the fees table
- If `amount` is provided for a fixed fee, it is ignored
- If `amount` is missing for a variable fee, request fails with `400 Bad Request`
- If `fee_id` is invalid or inactive, request fails with `400 Bad Request`

---

## 2. Fee Validation

The Payment Portal validates that the client-provided `fee_id` corresponds to an active fee in the system.

### Validation Steps

1. **Schema Validation** — Verify `fee_id` is present and non-empty
2. **Existence Check** — Query fees table to confirm fee exists and is active
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
| `fee_id` not found or inactive | 400 | `FEE_NOT_FOUND` | Fee type is not available |
| Variable fee, amount missing | 400 | `AMOUNT_REQUIRED` | Amount is required for variable fees |

---

## 3. Fee Configuration & Lookup

Once `fee_id` is determined, the Payment Portal queries the `fees` table to resolve the Pay.gov configuration and amount.

### Fees Table Schema

```sql
CREATE TABLE fees (
  fee_id          VARCHAR(50) PRIMARY KEY,
  tcs_app_id      VARCHAR(50) NOT NULL,
  is_variable     BOOLEAN NOT NULL DEFAULT false,
  amount          DECIMAL(10,2),  -- Required when is_variable = false, NULL when is_variable = true
  description     TEXT NOT NULL,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**Example Data:**

| fee_id | tcs_app_id | is_variable | amount | description | active |
|--------|-----------|-------------|--------|-------------|--------|
| PETITION_FILING | USTC_PETITION | false | 60.00 | Petition Filing Fee | true |
| COPY_REQUEST | USTC_COPY | true | NULL | Document Copy Request (varies by page count) | true |
| ADMISSION_FEE | USTC_ADMISSION | false | 250.00 | Non-Attorney Exam Registration | true |

### Lookup Query

```sql
SELECT tcs_app_id, is_variable, amount, description
FROM fees
WHERE fee_id = :fee_id
  AND active = true;
```

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
| Fee not found or inactive | 400 | `FEE_NOT_FOUND` | Fee type is not available |
| Variable fee, amount missing | 400 | `AMOUNT_REQUIRED` | Amount is required for variable fees |
| Variable fee, invalid amount | 400 | `INVALID_AMOUNT` | Amount must be positive |
| Fixed fee, amount ignored | N/A | N/A | Client amount ignored (logged for audit) |

---

## 4. Authorization Model

After resolving the fee configuration, the Payment Portal validates that the requesting client is authorized to charge that fee.

### Client Permissions Table Schema

```sql
CREATE TABLE client_fee_permissions (
  app_id         VARCHAR(50) NOT NULL,
  tcs_app_id     VARCHAR(50) NOT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (app_id, tcs_app_id)
);
```

**Example Data:**

| app_id | tcs_app_id |
|--------|-----------|
| DAWSON | USTC_PETITION |
| DAWSON | USTC_COPY |
| EXAM_PORTAL | USTC_ADMISSION |

### Authorization Query

The authorization check validates that the client's `app_id` is permitted to use the `tcs_app_id` associated with the fee:

```sql
SELECT 1
FROM client_fee_permissions
WHERE app_id = :app_id
  AND tcs_app_id = :tcs_app_id;
```

### Authorization Decision

| Condition | Result | HTTP Response |
|-----------|--------|---------------|
| Record exists | Authorized | Continue processing |
| No record | Not authorized | `403 Forbidden` |

**Error Response Example:**

```json
{
  "error": "UNAUTHORIZED_FEE",
  "message": "Application 'DAWSON' is not authorized to charge fee 'ADMISSION_FEE'"
}
```

**Critical Security Note:** Authorization failures must not reveal whether the fee exists or is simply unauthorized. Return consistent `403 Forbidden` responses.

---

## 5. Pay.gov Request Construction

After authorization is confirmed, the Payment Portal constructs the SOAP request to Pay.gov.

### Request Payload

| Field | Source | Example |
|-------|--------|---------|
| `tcs_app_id` | Derived from fees table | `USTC_PETITION` |
| `agency_tracking_id` | Client's `transactionReferenceId` | `550e8400-...` |
| `transaction_amount` | Fees table (fixed) OR client request (variable) | `60.00` |

```xml
<startOnlineCollection>
  <tcs_app_id>USTC_PETITION</tcs_app_id>
  <agency_tracking_id>550e8400-e29b-41d4-a716-446655440000</agency_tracking_id>
  <transaction_amount>60.00</transaction_amount>
  <url_success>https://dawson.ustaxcourt.gov/payment/success</url_success>
  <url_cancel>https://dawson.ustaxcourt.gov/payment/cancel</url_cancel>
</startOnlineCollection>
```

### Data Flow Summary

**Fixed Fee Flow:**
```
Client Provides:    app_id, fee_id, metadata, redirects
      ↓
PP Validates:       fee_id exists and active
      ↓
PP Looks Up:        tcs_app_id, is_variable=false, amount (from fees table)
      ↓
PP Authorizes:      (app_id, tcs_app_id) relationship
      ↓
PP Sends to Pay.gov: tcs_app_id, amount (from table), redirects
```

**Variable Fee Flow:**
```
Client Provides:    app_id, fee_id, amount, metadata, redirects
      ↓
PP Validates:       fee_id exists and active, amount > 0
      ↓
PP Looks Up:        tcs_app_id, is_variable=true (from fees table)
      ↓
PP Authorizes:      (app_id, tcs_app_id) relationship
      ↓
PP Sends to Pay.gov: tcs_app_id, amount (from client), redirects
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
- Direct SQL: `INSERT INTO fees (fee_id, tcs_app_id, amount, description, active) VALUES (...)`
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
- Authorization table is managed by Payment Portal

**Adding Client Authorization:**
```sql
INSERT INTO client_fee_permissions (app_id, tcs_app_id)
VALUES ('NEW_CLIENT_APP', 'USTC_PETITION');
```

---

## 7. Adding a New Fee

### Step-by-Step Process

**1. Create Fee Definition**

```sql
-- Fixed fee example
INSERT INTO fees (fee_id, tcs_app_id, is_variable, amount, description, active)
VALUES ('NEW_FIXED_FEE', 'USTC_NEW_APP', false, 100.00, 'New Fixed Fee Description', true);

-- Variable fee example
INSERT INTO fees (fee_id, tcs_app_id, is_variable, amount, description, active)
VALUES ('NEW_VARIABLE_FEE', 'USTC_VAR_APP', true, NULL, 'New Variable Fee Description', true);
```

**2. Update API Documentation**

Add the new `fee_id` to your API documentation and client SDKs so clients know it's available.

**3. Configure Client Authorization**

```sql
INSERT INTO client_fee_permissions (app_id, tcs_app_id)
VALUES ('AUTHORIZED_CLIENT', 'USTC_NEW_APP');
```

**4. Configure Pay.gov**

Ensure `USTC_NEW_APP` is configured in Pay.gov before deployment.

**5. Deploy**

Deploy code changes and run migrations in each environment.

---

## 8. Architecture Guarantees

This design provides the following guarantees:

| Guarantee | Enforcement Mechanism |
|-----------|----------------------|
| Clients cannot manipulate fixed fee amounts | Fixed amounts resolved from fees table only |
| Variable fee amounts are validated | Amount presence and positivity checks for variable fees |
| Clients cannot select unauthorized fees | Authorization table enforces app_id + tcs_app_id relationship |
| Fee type determination is centralized | All fee_id derivation logic in Payment Portal |
| Pay.gov details are abstracted | Clients never interact with tcs_app_id |
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


