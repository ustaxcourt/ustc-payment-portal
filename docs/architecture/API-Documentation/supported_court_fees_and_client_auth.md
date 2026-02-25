# Payment Portal — Fee Determination & Authorization Architecture

## Overview

The Payment Portal is the authoritative system for initiating payment transactions with Pay.gov on behalf of client applications. This document defines how the Payment Portal determines fees, validates authorization, and constructs Pay.gov requests.

### Core Architectural Principle

**Client applications provide business context; the Payment Portal determines financial values.**

Clients submit metadata describing the transaction. The Payment Portal derives the fee type, validates authorization, resolves the amount, and constructs the Pay.gov request. Clients never provide fee identifiers, amounts, or Pay.gov configuration values.

This design ensures:
- Centralized fee governance
- Prevention of amount manipulation
- Consistent authorization enforcement
- Abstraction of Pay.gov integration details

---

## Terminology

- **`app_id`** — Identifier for a client application (e.g., `DAWSON`)
- **`fee_id`** — Internal identifier for a fee type (e.g., `PETITION_FILING`)
- **`tcs_app_id`** — Pay.gov application identifier (TCS = Treasury Collection System)
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

| Field | Description | Provided By |
|-------|-------------|-------------|
| `app_id` | Client application identifier | Client |
| `transactionReferenceId` | Client-generated UUID for idempotency | Client |
| `urlSuccess` | Redirect URL after successful payment | Client |
| `urlCancel` | Redirect URL if payment is cancelled | Client |
| `metadata` | Business context describing the transaction | Client |

**Example Request:**

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

**Critical Constraint:** Clients do not provide `fee_id`, `amount`, or `tcs_app_id`. These are derived internally by the Payment Portal.

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
  amount          DECIMAL(10,2) NOT NULL,
  description     TEXT NOT NULL,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**Example Data:**

| fee_id | tcs_app_id | amount | description | active |
|--------|-----------|--------|-------------|--------|
| PETITION_FILING | USTC_PETITION | 60.00 | Petition Filing Fee | true |
| COPY_REQUEST | USTC_COPY | 30.00 | Document Copy Request | true |
| ADMISSION_FEE | USTC_ADMISSION | 250.00 | Non-Attorney Exam Registration | true |

### Lookup Query

```sql
SELECT tcs_app_id, amount, description
FROM fees
WHERE fee_id = :fee_id
  AND active = true;
```

If no active record is found:
- **Response:** `400 Bad Request`
- **Body:** `{ "error": "FEE_NOT_FOUND", "message": "Fee type is not available" }`

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
| `transaction_amount` | Resolved from fees table | `60.00` |
| `url_success` | Client request | `https://dawson.../success` |
| `url_cancel` | Client request | `https://dawson.../cancel` |

**Example SOAP Envelope (simplified):**

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

```
Client Provides:    app_id, metadata, redirects
      ↓
PP Determines:      fee_id (from metadata)
      ↓
PP Looks Up:        tcs_app_id, amount (from fees table)
      ↓
PP Validates:       (app_id, tcs_app_id) authorization
      ↓
PP Sends to Pay.gov: tcs_app_id, amount, redirects
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
INSERT INTO fees (fee_id, tcs_app_id, amount, description, active)
VALUES ('NEW_FEE_TYPE', 'USTC_NEW_APP', 100.00, 'New Fee Description', true);
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
| Clients cannot manipulate amounts | Amounts resolved from fees table only |
| Clients cannot select unauthorized fees | Authorization table enforces app_id + tcs_app_id relationship |
| Fee governance is centralized | All fee data in Payment Portal database |
| Pay.gov details are abstracted | Clients never interact with tcs_app_id |
| Authorization is auditable | All checks logged with context |

---

## 10. Error Reference

| Error Code | HTTP Status | Description | Client Action |
|------------|-------------|-------------|---------------|
| `UNKNOWN_FEE_TYPE` | 400 | Metadata doesn't match any fee pattern | Verify metadata structure |
| `UNAUTHORIZED_FEE` | 403 | Client not authorized for this fee | Request authorization |
| `INVALID_REQUEST` | 400 | Schema validation failure | Fix request format |
| `PAY_GOV_ERROR` | 502 | Pay.gov integration failure | Retry later |

---


