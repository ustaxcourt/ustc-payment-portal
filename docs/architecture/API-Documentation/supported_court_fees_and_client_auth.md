# Payment Portal — Fee Determination & Authorization Architecture

## Overview

The Payment Portal (PP) is the authoritative system responsible for initiating payment transactions with Pay.gov on behalf of client applications (e.g., DAWSON). In the current architecture, PP is the **source of truth for fee determination, authorization, and transaction amounts**.

Client applications do **not** provide payment amounts or fee identifiers. Instead, they provide business metadata describing the transaction, and PP derives the appropriate fee internally.

This document describes the current design so that future developers understand how fee determination and authorization are handled within the system.

---

## Core Architectural Principle

> Payment amounts must be determined exclusively by the Payment Portal.

External systems provide identifiers and contextual metadata only. Financial values are never trusted from external sources.

---

## Request Model

Client applications initiate a payment by sending a request containing:

* Application identifier (`appId`)
* Client-generated transaction reference (`transactionReferenceId`)
* Redirect URLs
* Business metadata describing the transaction

Example:

```json
{
  "appId": "DAWSON",
  "transactionReferenceId": "550e8400-e29b-41d4-a716-446655440000",
  "urlSuccess": "https://client.app/success",
  "urlCancel": "https://client.app/cancel",
  "metadata": {
    "docketNumber": "123456",
    "petitionNumber": "PET-7890"
  }
}
```

The metadata fields vary depending on the business context but must contain sufficient information for PP to determine the fee type.

---

## High-Level Flow

The Payment Portal processes requests using the following sequence:

1. Validate request schema
2. Determine fee type from metadata
3. Validate client authorization for the fee
4. Resolve fee amount from internal configuration
5. Create transaction record
6. Initiate Pay.gov request
7. Return redirect token to client

---

## Fee Determination

Fee type is derived using deterministic logic based on request metadata.

Examples:

* Presence of `petitionNumber` → Petition Filing Fee
* Presence of `copyRequestId` → Copy Request Fee
* Presence of `admissionId` → Admission Fee

If metadata does not map to a known fee type, the request is rejected.

If metadata maps to multiple fee types, the request is rejected as ambiguous.

Fee determination logic is owned entirely by the Payment Portal and is not configurable by clients.

---

## Authorization Model

After determining the fee type, PP verifies that the requesting application is authorized to charge that fee.

If the client application is not authorized for the derived fee type, the request is rejected.

This ensures:

* Applications cannot initiate unauthorized payments
* Fee access is controlled in one location
* Governance is consistent across all clients

---

## Fee Resolution

Once authorization is confirmed, PP resolves the monetary amount associated with the fee type.

Fee definitions are stored internally and include:

* Fee type
* Amount
* Currency
* Status (active/inactive)
* Effective dates (when applicable)

This allows PP to maintain consistent fee schedules across all applications.

---



## Storage Model

The Payment Portal maintains several internal tables to support fee determination, authorization, and governance. These tables represent the authoritative source for financial configuration.

---

### 1. Fees Table

This table represents the financial source of truth for all fee amounts.

```
fees
------
fee_type (PK)
amount
currency
description
active
created_at
updated_at
```


### 2. Client Authorization Table

This table defines which client applications are authorized to charge specific fee types.

```
client_fee_permissions
----------------------
app_id
fee_type
```

Composite Primary Key:

```
(app_id, fee_type)
```

#### Purpose

This table enforces governance by preventing client applications from initiating payments for unauthorized fee types. Authorization is centrally managed within the Payment Portal to ensure consistency and compliance across all integrations.

---

### 3. (Optional) Fee Rules Table

This table is only required if the system adopts a configuration-driven fee determination strategy.

```
fee_rules
---------
fee_type
required_metadata_fields
priority
```

#### Purpose

The `fee_rules` table allows fee determination logic to be driven by configuration rather than hardcoded logic. Each rule defines:

* The fee type to apply
* The metadata fields required to match the rule
* A priority value to resolve conflicts when multiple rules match

This enables adding or modifying fee determination behavior without deploying new application code.
