# USTC Payment Portal — API Reference

> **Status:** 0.1.3
> **Audience:** USTC internal applications integrating with the Payment Portal.
> **Related repos:**
> - **[USTC Payment Portal](https://github.com/ustaxcourt)**
> - **[USTC Pay Test Server](https://github.com/ustaxcourt/ustc-pay-gov-test-server)**

The Payment Portal provides a REST API that initiates and completes Pay.gov Hosted Collection Pages (HCP) transactions on behalf of USTC applications. The portal abstracts SOAP calls, token handling, redirect URL generation, and status lookups.

---

## Table of Contents

- #servers
- #authentication-aws-sigv4
- #idempotency
- #errors
- #endpoints
  - #post-init
  - #get-detailsappidtransactionreferenceid
  - #post-process
- #schemas
- #examples
- #changelog

---

## Servers

| Environment | Base URL                       | Description           |
|-------------|--------------------------------|-----------------------|
| Local       | `http://localhost:8080`        | Local development     |
| Dev         | `https://dev-payments.ustaxcourt.gov` | Development           |
| Staging     | `https://stg-payments.ustaxcourt.gov` | Test/Staging          |
| Production  | `https://payments.ustaxcourt.gov`     | Production            |

> Use the correct base URL per environment when calling the endpoints above.

---

## Authentication (AWS SigV4)

All requests must be **signed with AWS Signature Version 4 (SigV4)** using IAM credentials permitted to invoke this API. Include:

- `Authorization: Bearer AWS4-HMAC-SHA256 ...`
- `X-Amz-Date: YYYYMMDDThhmmssZ`
- `X-Amz-Security-Token: <session token>` (when using temporary creds)

SDKs can generate these headers automatically; if hand‑signing, follow AWS SigV4 guidance. (The OpenAPI security scheme name is `sigv4` and uses the `Authorization` header.)

---

## Idempotency

Use the header:

```

Idempotency-Key: <uuid-v4>

```

- **/init:** The first successful request with a given key creates a session and returns `{ token, paymentRedirect }`. Retries with the same key return the original response (inputs must match).
- **/process:** Retries with the same key return the same computed result for a given `token`.
- **Retention window:** environment‑specific (confirm operational setting).

---

## Errors

This API may return a **plain text** body for some error responses (400/403/500), as defined in the OpenAPI spec. When present, the text is a concise cause message (e.g., `missing body`, `Invalid Request`, `Internal Server Error`).

Other errors may return JSON if produced upstream; clients should treat non‑200 responses as errors and inspect content‑type accordingly.

---

## Endpoints

### POST `/init`

Creates a new payment session and returns a **redirect URL** for the user to complete payment on Pay.gov.

**Security**
- SigV4 (`Authorization`, `X-Amz-Date`, optional `X-Amz-Security-Token`)

**Headers**
```

Content-Type: application/json
Idempotency-Key: <uuid-v4>     # recommended

````

**Request body — `InitPaymentRequest`**
```json
{
  "appId": "DAWSON",
  "transactionReferenceId": "550e8400-e29b-41d4-a716-446655440000",
  "feeId": "PETITIONS_FILING_FEE",
  "urlSuccess": "https://client.app/success",
  "urlCancel": "https://client.app/cancel",
  "metadata": {
    "...": "fields depend on feeId (see Metadata schemas)"
  }
}
````

**Response 200 — `InitPaymentResponse`**

```json
{
  "token": "abc123token",
  "paymentRedirect": "https://pay.gov/payment?token=abc123token&tcsAppID=USTC_APP"
}
```

**Errors**

*   **400** `text/plain` — invalid request payload (e.g., missing body, validation error)
*   **403** `text/plain` — forbidden/invalid/missing authentication
*   **500** `text/plain` — internal server error

***

### GET `/details/{appId}/{transactionReferenceId}`

Returns the **overall payment status** and all associated **transaction records**. If any transaction is pending, the portal may query Pay.gov before responding.

**Security**

*   SigV4

**Path parameters**

*   `appId` — application identifier (e.g., `DAWSON`)
*   `transactionReferenceId` — the transaction reference ID

**Response 200 — `GetDetailsResponse`**

```json
{
  "paymentStatus": "Success",
  "transactions": [
    {
      "transactionStatus": "Success",
      "paymentMethod": "Credit/Debit Card",
      "returnDetail": "Transaction completed successfully",
      "createdTimestamp": "2024-01-15T10:30:00Z",
      "updatedTimestamp": "2024-01-15T10:35:00Z"
    }
  ]
}
```

**Errors**

*   **400** `text/plain` — invalid request (e.g., missing path params)
*   **403** `text/plain` — forbidden/invalid/missing authentication
*   **500** `text/plain` — internal server error

***

### POST `/process`

Finalizes a payment after the user completes the Pay.gov form.

> **Important:** This endpoint **always returns HTTP 200** for a handled request. Determine outcome by inspecting `paymentStatus` (or each `transactionStatus`). Both successful and failed payment processing use HTTP 200 responses.

**Security**

*   SigV4

**Headers**

    Content-Type: application/json
    Idempotency-Key: <uuid-v4>     # recommended

**Request body — `ProcessPaymentRequest`**

```json
{
  "appId": "DAWSON",
  "token": "abc123token"
}
```

**Response 200 — `ProcessPaymentResponse`**

```json
{
  "paymentStatus": "Success",
  "transactions": [
    {
      "transactionStatus": "Success",
      "paymentMethod": "Credit/Debit Card",
      "returnDetail": "Transaction completed successfully",
      "createdTimestamp": "2024-01-15T10:30:00Z",
      "updatedTimestamp": "2024-01-15T10:35:00Z"
    }
  ]
}
```

**Errors**

*   **400** `text/plain` — invalid request payload (e.g., missing body)
*   **403** `text/plain` — forbidden/invalid/missing authentication
*   **500** `text/plain` — internal server error

***

## Schemas (Summary)

*   **FeeId** (enum): `PETITIONS_FILING_FEE`, `NONATTORNEY_EXAM_REGISTRATION`
*   **Metadata** (anyOf):
    *   **MetadataDawson**: `{ docketNumber: string }` (required)
    *   **MetadataNonattorneyExam**: `{ email, fullName, accessCode }` (all required; `email` format)
*   **InitPaymentRequest**: `{ appId, transactionReferenceId (uuid), feeId, urlSuccess (uri), urlCancel (uri), metadata }` (all required)
*   **InitPaymentResponse**: `{ token, paymentRedirect (uri) }` (both required)
*   **ProcessPaymentRequest**: `{ appId, token }` (both required)
*   **ProcessPaymentResponse**: `{ paymentStatus (Success|Failed|Pending), transactions: TransactionRecordSummary[] }`
*   **GetDetailsResponse**: `{ paymentStatus, transactions: TransactionRecordSummary[] }`
*   **TransactionRecordSummary**: `{ transactionStatus (Received|Initiated|Success|Failed|Pending), paymentMethod (Credit/Debit Card|ACH|PayPal), returnDetail?, createdTimestamp (date-time)?, updatedTimestamp (date-time)? }`

> Return/error bodies and content‑types are exactly as defined in the OpenAPI document.

***

## Examples

### `POST /init` (cURL with SigV4 headers)

> Use your SigV4 signer or SDK to produce the `Authorization` and `X-Amz-Date` headers.

```bash
curl -sS -X POST "$BASE_URL/init" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "X-Amz-Date: $(date -u +%Y%m%dT%H%M%SZ)" \
  -H "Authorization: $(your_sigv4_header_here)" \
  -d '{
    "appId": "DAWSON",
    "transactionReferenceId": "550e8400-e29b-41d4-a716-446655440000",
    "feeId": "PETITIONS_FILING_FEE",
    "urlSuccess": "https://client.app/success",
    "urlCancel": "https://client.app/cancel",
    "metadata": { "docketNumber": "123-26" }
  }'
```

**Success (200)**

```json
{
  "token": "abc123token",
  "paymentRedirect": "https://pay.gov/payment?token=abc123token&tcsAppID=USTC_APP"
}
```

***

### `GET /details/{appId}/{transactionReferenceId}`

```bash
curl -sS "$BASE_URL/details/DAWSON/550e8400-e29b-41d4-a716-446655440000" \
  -H "X-Amz-Date: $(date -u +%Y%m%dT%H%M%SZ)" \
  -H "Authorization: $(your_sigv4_header_here)"
```

***

### `POST /process` (Node.js; pseudo‑signer)

```js
const body = {
  appId: 'DAWSON',
  token: 'abc123token'
};

const { headers } = await signWithSigV4({
  method: 'POST',
  url: `${BASE_URL}/process`,
  body: JSON.stringify(body),
});

const res = await fetch(`${BASE_URL}/process`, {
  method: 'POST',
  headers: {
    ...headers,
    'Content-Type': 'application/json',
    'Idempotency-Key': crypto.randomUUID(),
  },
  body: JSON.stringify(body),
});

const result = await res.json(); // always 200; inspect fields below

if (result.paymentStatus !== 'Success') {
  // handle Failed/Pending
}
```

***

## Changelog

*   **v0.1.3 (current)** — Aligned docs exactly with OpenAPI 3.1: SigV4 auth, `/init`, `/process`, `/details/{appId}/{transactionReferenceId}`, schema field names, and plain‑text error responses.
*   **Earlier drafts** — Deprecated `/v1/...` paths and Bearer-token notes removed (those described a previous iteration).
