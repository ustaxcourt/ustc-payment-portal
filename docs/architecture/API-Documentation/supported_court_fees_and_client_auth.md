# Payment Portal — Fee Determination & Authorization Architecture

## Overview

The Payment Portal is the authoritative system for initiating payment transactions with Pay.gov on behalf of client applications. This document defines how the Payment Portal determines fees, validates authorization, and constructs Pay.gov requests.

### Core Architectural Principle

**Client applications provide business context; the Payment Portal determines fee types and manages financial values.**

Clients submit metadata describing the transaction. The Payment Portal derives the fee type, validates authorization, and constructs the Pay.gov request.

**Fee Amount Determination:**
- **Fixed fees:** Amount is resolved from the Payment Portal's fees table (e.g., petition filing fee of $60)
- **Variable fees:** Amount is provided by the client and validated by the Payment Portal (e.g., payment for copies where quantity varies)

Clients never provide `fee_id` or `tcs_app_id` — these are always derived internally.

This design ensures:
- Centralized fee governance and type determination
- Validation of client-provided amounts for variable fees
- Prevention of unauthorized fee access
- Consistent authorization enforcement
- Abstraction of Pay.gov integration details

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
1. Client Request (metadata + app_id)
   ↓
2. Fee Determination (metadata → fee_id)
   ↓
3. Fee Lookup (fee_id → tcs_app_id + amount)
   ↓
4. Authorization Check (app_id + tcs_app_id)
   ↓
5. Pay.gov Request Construction
   ↓
6. Transaction Initiation
```

Each stage is described in detail below.

---

## 1. Client Request Model

Clients initiate payments by submitting:

| Field | Description | Provided By | Required |
|-------|-------------|-------------|----------|
| `app_id` | Client application identifier | Client | Always |
| `transactionReferenceId` | Client-generated UUID for idempotency | Client | Always |
| `urlSuccess` | Redirect URL after successful payment | Client | Always |
| `urlCancel` | Redirect URL if payment is cancelled | Client | Always |
| `metadata` | Business context describing the transaction | Client | Always |
| `amount` | Payment amount (only for variable fees) | Client | Variable fees only |

**Example Request (Fixed Fee):**

```json
{
  "app_id": "DAWSON",
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
- Clients never provide `fee_id` or `tcs_app_id` — these are always derived internally
- Clients provide `amount` only for variable fees; for fixed fees, amount is resolved from the fees table
- If `amount` is provided for a fixed fee, it is ignored
- If `amount` is missing for a variable fee, request fails with `400 Bad Request`

---

## 2. Fee Determination Layer

The Payment Portal determines the `fee_id` by evaluating request metadata against predefined patterns.

### Determination Logic

The fee determination logic is implemented in the application layer and uses deterministic rules:

| Metadata Pattern | Derived fee_id | Description |
|------------------|----------------|-------------|
| `petitionNumber` present | `PETITION_FILING` | Court petition filing fee |
| `copyRequestId` present | `COPY_REQUEST` | Document copy request fee |
| `admissionId` present | `ADMISSION_FEE` | Non-attorney admission exam fee |

### Implementation Notes

- Logic resides in: `src/useCases/initPyment.ts` (or equivalent)
- New fee types require code deployment to add patterns
- Unmapped metadata results in HTTP 400 with error: `UNKNOWN_FEE_TYPE`

### Error Handling

If metadata does not match any pattern:
- **Response:** `400 Bad Request`
- **Body:** `{ "error": "UNKNOWN_FEE_TYPE", "message": "Unable to determine fee from provided metadata" }`

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

| Condition | HTTP Status | Error Code | Message |
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
Client Provides:    app_id, metadata, redirects
      ↓
PP Determines:      fee_id (from metadata)
      ↓
PP Looks Up:        tcs_app_id, is_variable=false, amount (from fees table)
      ↓
PP Validates:       (app_id, tcs_app_id) authorization
      ↓
PP Sends to Pay.gov: tcs_app_id, amount (from table), redirects
```

**Variable Fee Flow:**
```
Client Provides:    app_id, metadata, amount, redirects
      ↓
PP Determines:      fee_id (from metadata)
      ↓
PP Looks Up:        tcs_app_id, is_variable=true (from fees table)
      ↓
PP Validates:       (app_id, tcs_app_id) authorization + amount > 0
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
- Authorization table is managed by Payment Portal adminis

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

**2. Add Fee Determination Logic**

Update `src/useCases/determineFee.ts`:

```typescript
if (metadata.newFieldPresent) {
  return 'NEW_FEE_TYPE';
}
```

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

## 10. Error Reference

| Error Code | HTTP Status | Description | Client Action |
|------------|-------------|-------------|---------------|
| `UNKNOWN_FEE_TYPE` | 400 | Metadata doesn't match any fee pattern | Verify metadata structure |
| `AMOUNT_REQUIRED` | 400 | Variable fee requires amount in request | Add amount field to request |
| `INVALID_AMOUNT` | 400 | Amount is zero, negative, or invalid format | Provide positive decimal amount |
| `UNAUTHORIZED_FEE` | 403 | Client not authorized for this fee | Request authorization |
| `INVALID_REQUEST` | 400 | Schema validation failure | Fix request format |
| `PAY_GOV_ERROR` | 502 | Pay.gov integration failure | Retry later |

---


