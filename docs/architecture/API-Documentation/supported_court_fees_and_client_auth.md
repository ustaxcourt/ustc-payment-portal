# Payment Portal — Fee Determination & Authorization Architecture

## Overview

The Payment Portal is the authoritative system for initiating payment transactions with Pay.gov on behalf of client applications. This document defines how the Payment Portal determines fees, validates authorization, and constructs Pay.gov requests.

### Core Architectural Principle

**Clients provide fee identifiers and business context; the Payment Portal validates authorization and manages Pay.gov integration.**

Clients submit a `fee` (a stable fee key like `PETITION_FILING_FEE`) to specify which fee they want to charge, along with metadata for audit purposes. The Payment Portal validates the fee exists, checks authorization, and constructs the Pay.gov request. The `fee` is resolved to the version active as of a given point in time, which provides the `tcsAppId` (a Pay.gov-provided identifier) and the fee amount.

**Fee Amount Determination:**

- **Fixed fees:** Amount is resolved from the Payment Portal's in-code fee catalog (e.g., petition filing fee of $60)
- **Variable fees:** Amount is provided by the client and validated by the Payment Portal (e.g., payment for copies where quantity varies)

This design ensures:

- Clients explicitly declare payment intent via `fee`
- Authorization prevents clients from charging unauthorized fees
- Pay.gov identifiers (`tcsAppId`) are abstracted from clients
- Variable fee amounts are validated before processing
- Consistent audit trail via metadata

---

## Terminology

- **`fee`** — Stable client-facing identifier for a fee type (e.g., `PETITION_FILING_FEE`). This is what clients send in the `fee` field of API requests, what is stored in the `transactions.fee` column, and what keys the `staticFees` object in [`src/config/fees.ts`](../../../src/config/fees.ts). Shared across all versions of a fee. Internally typed as `FeeKey` in schemas / permissions.
- **`tcsAppId`** — Pay.gov application identifier (e.g., `TCSUSTAXCOURTANAEF`). Resolved from the active fee version using the `fee` provided by the client.
- **`activationDate`** — When a fee version becomes active. The Portal always uses the most recent version whose `activationDate` is `<=` the reference date (see "Version resolution" below).
- **`isVariable`** — Boolean indicating whether the fee amount is client-provided (`true`) or portal-determined (`false`)
- **metadata** — Business context provided by clients to identify transaction type
- **Payment Portal (PP)** — This system

**Note:** Clients send `fee` → Portal resolves the active fee version → Portal uses `tcsAppId` and `amount` from that version when calling Pay.gov.

---

## Architecture Overview

### Request Processing Flow

```
1. Client Request (fee + metadata)
   ↓
2. Authorization Check (IAM role ARN + fee)
   ↓
3. Fee Resolution (fee → active FeeVersion → tcsAppId + isVariable + amount)
   ↓
4. Amount Resolution (fixed: use catalog, variable: use client amount)
   ↓
5. Pay.gov Request Construction (use tcsAppId from resolution)
   ↓
6. Transaction Initiation (fee stored on transaction for audit / amount derivation)
```

Each stage is described in detail below.

---

## 1. Client Request Model

Clients initiate payments by submitting:

| Field                    | Description                                       | Provided By | Required           |
| ------------------------ | ------------------------------------------------- | ----------- | ------------------ |
| `fee`                    | Stable fee key identifying the fee type to charge | Client      | Always             |
| `transactionReferenceId` | Client-assigned reference ID for this transaction | Client      | Always             |
| `urlSuccess`             | Redirect URL after successful payment             | Client      | Always             |
| `urlCancel`              | Redirect URL if payment is cancelled              | Client      | Always             |
| `metadata`               | Business context for audit/reporting              | Client      | Always             |
| `amount`                 | Payment amount (only for variable fees)           | Client      | Variable fees only |

**Note:** The Payment Portal generates the `agencyTrackingId` (used in Pay.gov requests) internally. Clients do not provide this value.

**Example Request (Fixed Fee):**

```json
{
  "fee": "PETITION_FILING_FEE",
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
  "fee": "COPY_REQUEST",
  "transactionReferenceId": "9f1e0f34-4b2a-4c88-9a5f-1a2b3c4d5e6f",
  "urlSuccess": "https://dawson.ustaxcourt.gov/payment/success",
  "urlCancel": "https://dawson.ustaxcourt.gov/payment/cancel",
  "amount": 45.0,
  "metadata": {
    "copyRequestId": "COPY-2026-001",
    "numberOfPages": 150
  }
}
```

**Critical Constraints:**

- Clients must provide `fee` to specify which fee to charge
- The `fee` value must match a key defined in `staticFees` with at least one activated version
- The portal resolves the active fee version, then uses its `tcsAppId` and `amount`
- Clients provide `amount` only for variable fees; for fixed fees, amount is resolved from the catalog
- If `amount` is provided for a fixed fee, the request fails with `400 Bad Request`
- If `amount` is missing for a variable fee, request fails with `400 Bad Request`
- If the fee is unknown, request fails with `400 Bad Request`

---

## 2. Fee Validation

The Payment Portal validates that the client-provided `fee` corresponds to a known, active fee.

### Validation Steps

1. **Schema Validation** — Verify `fee` is present, non-empty, and matches `FeeKeySchema` (a Zod enum of the known fee keys)
2. **Authorization Check** — Verify the client's IAM role is permitted to charge this fee (`allowedFeeKeys`)
3. **Existence Check** — Call `getActiveFee(fee)` and confirm a version has activated
4. **Variable Fee Amount Check** — If the resolved fee is variable, validate `amount` is present and positive

### Implementation Notes

- Logic resides in [`src/useCases/initPayment.ts`](../../../src/useCases/initPayment.ts)
- Authorization is checked before the fee lookup (see [`src/authorizeClient.ts`](../../../src/authorizeClient.ts))
- Unknown fee results in early rejection to avoid unnecessary processing
- Metadata is stored for audit purposes but not used for fee determination

### Error Handling

| Condition                    | HTTP Status | Error Code        | Message                                     |
| ---------------------------- | ----------- | ----------------- | ------------------------------------------- |
| `fee` missing                | 400         | `INVALID_REQUEST` | `fee` is required                           |
| Fee unknown                  | 400         | `FEE_NOT_FOUND`   | `Unknown fee: <fee>`                        |
| Variable fee, amount missing | 400         | `AMOUNT_REQUIRED` | `Fee <fee> requires an amount`              |
| Fixed fee, amount supplied   | 400         | `INVALID_REQUEST` | `Fee <fee> does not allow variable amounts` |

---

## 3. Fee Catalog & Version Resolution

Fees are hardcoded in [`src/config/fees.ts`](../../../src/config/fees.ts) as the single source of truth. There is **no** `fees` DB table; the catalog changes by opening a PR against this file and shipping a release. The `transactions` table stores only the stable `fee` key (plus `createdAt`) — amount, name, `tcsAppId`, and version metadata are re-derived from the catalog on every read.

### Catalog shape

```ts
// src/config/fees.ts (excerpt)

export interface StaticFees {
  [fee: string]: FeeDefinition;
}

export interface FeeDefinition {
  name: string;
  tcsAppId: string;
  description?: string | null;
  versions: FeeVersion[]; // one entry per historical / future amount change
}

export type FeeVersion = {
  isVariable: boolean;
  amount?: number | null;
  activationDate: string; // ISO 8601
};

export const staticFees: StaticFees = {
  PETITION_FILING_FEE: {
    name: "Petition Filing Fee",
    tcsAppId: "TCSUSTAXCOURTPETITION",
    versions: [
      { isVariable: false, amount: 60, activationDate: "2026-03-05T00:00:00Z" },
      // Add a new entry with a future `activationDate` to change the amount.
    ],
    description: "Fee charged for filing a petition with the U.S. Tax Court.",
  },
  NONATTORNEY_EXAM_REGISTRATION_FEE: {
    name: "Non-Attorney Exam Registration Fee",
    tcsAppId: "TCSUSTAXCOURTANAEF",
    versions: [
      {
        isVariable: false,
        amount: 250,
        activationDate: "2026-03-05T00:00:00Z",
      },
    ],
    description:
      "Fee for non-attorneys to register for an examination with the U.S. Tax Court.",
  },
};
```

### Resolution API

```ts
export const getActiveFee = (
  fee: string,
  date: string | Date = new Date(),
): ActiveFee | undefined
```

- `fee` — the stable key (e.g. `"PETITION_FILING_FEE"`)
- `date` — the point in time to resolve against. Callers pass the transaction's `createdAt` so historical rows always reflect the version that was in effect **when the transaction was created**, even after a future version has activated.
- Returns a merged `ActiveFee` (definition fields + the winning `FeeVersion` fields + the echoed `fee` key), or `undefined` if the key is unknown or no version has activated by `date`.

The resolution rule: filter versions with `activationDate <= date`, pick the one with the most recent `activationDate`. Ties are prevented by convention — no two versions of the same key should share an `activationDate`.

**Example (post-refactor):**

| fee                                 | version | tcsAppId                | isVariable | amount | activationDate                 |
| ----------------------------------- | ------- | ----------------------- | ---------- | ------ | ------------------------------ |
| `PETITION_FILING_FEE`               | v1      | `TCSUSTAXCOURTPETITION` | false      | 60.00  | 2026-03-05T00:00:00Z           |
| `PETITION_FILING_FEE`               | v2      | `TCSUSTAXCOURTPETITION` | false      | 70.00  | 2026-06-01T00:00:00Z (planned) |
| `NONATTORNEY_EXAM_REGISTRATION_FEE` | v1      | `TCSUSTAXCOURTANAEF`    | false      | 250.00 | 2026-03-05T00:00:00Z           |

**Amount derivation on dashboard reads:** `TransactionModel.getAll` / `getByPaymentStatus` call `getActiveFee(row.fee, row.createdAt)` and hydrate `transactionAmount` and `feeName` from the result. This keeps historical rows accurate without persisting the amount per transaction.

### Amount Resolution Logic

**For fixed fees (`isVariable = false`):**

- Use `amount` from the resolved `ActiveFee`
- Reject the request if the client also supplied `amount`

**For variable fees (`isVariable = true`):**

- Require client to provide `amount` in request
- Validate amount is positive
- Use client-provided amount for the Pay.gov request

### Error Handling

| Condition                         | HTTP Status | Error Code        | Message                        |
| --------------------------------- | ----------- | ----------------- | ------------------------------ |
| Fee not found / no version active | 400         | `FEE_NOT_FOUND`   | `Unknown fee: <fee>`           |
| Variable fee, amount missing      | 400         | `AMOUNT_REQUIRED` | `Fee <fee> requires an amount` |
| Variable fee, invalid amount      | 400         | `INVALID_AMOUNT`  | `Amount must be positive`      |

---

## 4. Authorization Model

After resolving the fee configuration, the Payment Portal validates that the requesting client is authorized to charge that fee.

Client permissions are stored in the `ustc/pay-gov/{env}/client-permissions` secret in AWS Secrets Manager — not a database table. Each entry maps a client's IAM role ARN to the fee keys they are permitted to charge:

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

| Condition                                                                    | Result         | HTTP Response                                       |
| ---------------------------------------------------------------------------- | -------------- | --------------------------------------------------- |
| Role ARN found, fee in `allowedFeeKeys` (or `allowedFeeKeys` contains `"*"`) | Authorized     | Continue processing                                 |
| Role ARN found, fee not in `allowedFeeKeys`                                  | Not authorized | `403 Forbidden` — `"Client not authorized for fee"` |
| Role ARN not found                                                           | Not registered | `403 Forbidden` — `"Client not registered"`         |

---

## 5. Pay.gov Request Construction

After authorization is confirmed, the Payment Portal constructs the SOAP request to Pay.gov.

### Request Payload

| Field                | Source                                                  | Example                 |
| -------------------- | ------------------------------------------------------- | ----------------------- |
| `tcs_app_id`         | `ActiveFee.tcsAppId` (from `getActiveFee(fee)`)         | `TCSUSTAXCOURTPETITION` |
| `agency_tracking_id` | Generated by Payment Portal                             | `550e8400...`           |
| `transaction_amount` | `ActiveFee.amount` (fixed) OR client request (variable) | `60.00`                 |

```xml
<startOnlineCollection>
  <tcs_app_id>TCSUSTAXCOURTPETITION</tcs_app_id>
  <agency_tracking_id>550e8400e29b41d4a716446655440000</agency_tracking_id>
  <transaction_amount>60.00</transaction_amount>
  <url_success>https://dawson.ustaxcourt.gov/payment/success</url_success>
  <url_cancel>https://dawson.ustaxcourt.gov/payment/cancel</url_cancel>
</startOnlineCollection>
```

### Data Flow Summary

**Fixed Fee Flow:**

```
Client Provides:    fee, transactionReferenceId, metadata, redirects
      ↓
PP Authorizes:      (IAM role ARN, fee) via allowedFeeKeys
      ↓
PP Resolves:        getActiveFee(fee) → tcsAppId, isVariable=false, amount
      ↓
PP Records:         transaction with { fee, createdAt } — no amount persisted
      ↓
PP Sends to Pay.gov: tcsAppId (from resolution), amount (from resolution), redirects
```

**Variable Fee Flow:**

```
Client Provides:    fee, transactionReferenceId, amount, metadata, redirects
      ↓
PP Authorizes:      (IAM role ARN, fee) via allowedFeeKeys
      ↓
PP Validates:       amount > 0
      ↓
PP Resolves:        getActiveFee(fee) → tcsAppId, isVariable=true
      ↓
PP Records:         transaction with { fee, createdAt }
      ↓
PP Sends to Pay.gov: tcsAppId (from resolution), amount (from client), redirects
```

**Read Flow (`getDetails`, dashboards):**

```
DB Row:             { fee: "PETITION_FILING_FEE", createdAt, ... }
      ↓
PP Resolves:        getActiveFee(row.fee, row.createdAt)
      ↓
Response Hydration: feeName, transactionAmount, tcsAppId (for Pay.gov refresh) from the resolved version
```

---

## 6. Data Governance

### Fee Management

**Who Owns Fee Data:**

- The fee catalog is code: [`src/config/fees.ts`](../../../src/config/fees.ts). Changes go through the normal PR review and release process.
- There is no `fees` DB table and no fees seed to keep in sync.

**Fee Update Process (production and staging):**

1. Add or update the fee entry in `src/config/fees.ts`. For an amount change, add a new `FeeVersion` to the fee's `versions` array with a future `activationDate` — **do not** mutate an existing version.
2. Update unit tests that assert on the fee (e.g. [`src/config/fees.test.ts`](../../../src/config/fees.test.ts), any use-case tests with fee fixtures).
3. If a brand-new fee is being introduced, also extend `FeeKeySchema` in [`src/schemas/FeeKey.schema.ts`](../../../src/schemas/FeeKey.schema.ts) and any per-fee metadata schema.
4. Submit a PR. Once merged, cut a release / redeploy.
5. Update the `ustc/pay-gov/{env}/client-permissions` secret to grant `allowedFeeKeys` to any client that needs the new fee (no deploy required — the Lambda picks it up after the 5-minute cache TTL).

**Why not migrations any more:**

- The catalog is small (a handful of court fees), rarely changes, and every change is a coordinated PP + client-permissions rollout anyway. Keeping it in code eliminates a hot DB round-trip on every payment operation and removes the previous foot-gun where a `fees` row could drift from the code that referenced it.
- Historical audit is preserved by the `versions` array — old versions are never removed, so `getActiveFee(fee, oldRow.createdAt)` still returns exactly the version that was in effect when the transaction was created.

**Versioning Strategy:**

- Each `FeeDefinition` carries a `versions` array. To change an amount going forward, append a new `FeeVersion` with a future `activationDate`. The Portal always resolves the most recent version whose `activationDate` is `<=` the reference date. Because transactions store only the stable `fee` key + `createdAt`, historical rows automatically resolve to the version that was active when they were created.

### Authorization Management

**Who Owns Authorization Data:**

- Client permissions are managed by the Payment Portal team via the `ustc/pay-gov/{env}/client-permissions` secret in AWS Secrets Manager.

**Adding Client Authorization:**

Update the secret to add the client's IAM role ARN and allowed fee keys. No deployment required — Lambda picks up changes after the 5-minute cache TTL. See [client-onboarding.md](../../client-onboarding.md#permitting-apps-to-charge-specific-fees) for the full runbook.

---

## 7. Adding a New Fee

### Step-by-Step Process

**1. Add the fee definition to the catalog**

Edit [`src/config/fees.ts`](../../../src/config/fees.ts):

```ts
export const staticFees: StaticFees = {
  // ...existing entries...
  NEW_FIXED_FEE: {
    name: "New Application Fee",
    tcsAppId: "TCSUSTAXCOURTNEWAPP",
    description: "New Fixed Fee Description",
    versions: [
      {
        isVariable: false,
        amount: 100.0,
        activationDate: "2026-08-01T00:00:00Z",
      },
    ],
  },
};
```

To update an existing fee's amount, **append** a new `FeeVersion` with a future `activationDate` — do not mutate the existing version.

**Important:** The `tcsAppId` value must match the TCS application configured in Pay.gov.

**2. Extend the schemas**

- Add the new key to `FeeKeySchema` in [`src/schemas/FeeKey.schema.ts`](../../../src/schemas/FeeKey.schema.ts) so `POST /init` will accept it.
- If the new fee requires bespoke metadata, add a per-fee metadata schema and wire it into [`src/schemas/InitPayment.schema.ts`](../../../src/schemas/InitPayment.schema.ts) and [`src/schemas/Metadata.schema.ts`](../../../src/schemas/Metadata.schema.ts).

**3. Regenerate the OpenAPI docs**

```bash
npm run generate:openapi
```

Commit the updated [`docs/openapi.json`](../../openapi.json) and [`docs/openapi.yaml`](../../openapi.yaml).

**4. Configure client authorization**

Update the `ustc/pay-gov/{env}/client-permissions` secret in Secrets Manager to add the new fee key to each client's `allowedFeeKeys` that needs access. No deployment required — Lambda picks up the change after the 5-minute cache TTL. See [client-onboarding.md](../../client-onboarding.md#permitting-apps-to-charge-specific-fees) for the full runbook.

**5. Configure Pay.gov**

Coordinate with your Pay.gov liaison to set up a new TCS application:

- Request a new TCS application ID (e.g., `TCSUSTAXCOURTNEWAPP`)
- Provide fee details (name, amount if fixed, description)
- Confirm the TCS application is active before deploying code that uses it

**Important:** The `tcsAppId` value in your fee definition must exactly match the TCS application ID provided by Pay.gov.

**6. Deploy**

Deploy code changes to each environment. No migration is needed; the catalog change ships with the code.

---

## 8. Architecture Guarantees

This design provides the following guarantees:

| Guarantee                                   | Enforcement Mechanism                                                                                                                                                |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clients cannot manipulate fixed fee amounts | Fixed amounts resolved from `getActiveFee` only; not stored per transaction                                                                                          |
| Variable fee amounts are validated          | Amount presence and positivity checks for variable fees                                                                                                              |
| Clients cannot select unauthorized fees     | Secrets Manager `client-permissions` enforces IAM role ARN → `allowedFeeKeys`                                                                                        |
| Fee keys are validated                      | `fee` must match a `staticFees` entry with at least one activated version (also enforced at the API by `FeeKeySchema`)                                               |
| Pay.gov identifiers are abstracted          | Clients use `fee`; portal resolves `tcsAppId` from the active version                                                                                                |
| Historical amounts are auditable            | Transactions store `{ fee, createdAt }`; historical amount is `getActiveFee(fee, createdAt).amount`, and old `FeeVersion` entries are never removed from the catalog |

---

## 9. Error Reference

| Error Code         | HTTP Status | Description                                         | Client Action                           |
| ------------------ | ----------- | --------------------------------------------------- | --------------------------------------- |
| `FEE_NOT_FOUND`    | 400         | Unknown `fee`, or no version has activated yet      | Verify the `fee` field value is correct |
| `AMOUNT_REQUIRED`  | 400         | Variable fee requires `amount` in request           | Add `amount` field to request           |
| `INVALID_AMOUNT`   | 400         | Amount is zero, negative, or invalid format         | Provide positive decimal amount         |
| `UNAUTHORIZED_FEE` | 403         | Client not authorized for this fee                  | Request authorization via onboarding    |
| `INVALID_REQUEST`  | 400         | Schema validation failure                           | Fix request format                      |
| `PAY_GOV_ERROR`    | 500         | Pay.gov responded but result could not be processed | Retry later                             |
| `PAY_GOV_ERROR`    | 502         | Pay.gov's response was invalid or malformed         | Retry later                             |
| `PAY_GOV_ERROR`    | 504         | Could not reach Pay.gov                             | Retry later                             |
