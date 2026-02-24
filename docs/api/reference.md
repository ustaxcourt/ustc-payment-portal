# USTC Payment Portal — API Reference

> **Status:** Stable (v1).
> **Audience:** USTC internal applications integrating with the Payment Portal.
> **Related repos:**
>
> *   **[USTC Payment Portal](https://github.com/ustaxcourt)**
> *   **[USTC Pay Test Server](https://github.com/ustaxcourt/ustc-pay-gov-test-server)**

The Payment Portal provides a REST API that initiates and completes Pay.gov Hosted Collection Pages (HCP) transactions on behalf of USTC applications. The portal abstracts SOAP calls, token handling, and redirect URL generation.

***

## Table of Contents

*   \#base-urls--environments
*   \#authentication
*   \#idempotency
*   \#versioning
*   \#rate-limits--timeouts
*   \#errors
*   \#endpoints
    *   \#post-v1transactionsinitiate
    *   \#post-v1transactionscomplete
    *   \#get-v1health
*   \#callback-urls
*   \#field-reference
*   \#examples
*   \#changelog

***

## Base URLs & Environments

> Replace hostnames if they differ from your deployed infra.

| Environment | Base URL                                 | Notes                                                               |
| ----------- | ---------------------------------------- | ------------------------------------------------------------------- |
| Local       | `http://localhost:PORT`                  | Use with the **USTC Pay Test Server** for end‑to‑end local testing. |
| Development | `https://payment-portal.dev.example.gov` | Points to dev Pay.gov mock or dev HCP, depending on config.         |
| Staging     | `https://payment-portal.stg.example.gov` | Mirrors production settings for pre‑release validation.             |
| Production  | `https://payment-portal.example.gov`     | Live environment; **do not** test here.                             |

> See `/docs/deployment/promotions.md` for promotion flow and environment details. **TODO:** update actual hostnames and ports.

***

## Authentication

All endpoints require a **Bearer token** in the `Authorization` header.

    Authorization: Bearer <access_token>

*   **Token scope:** Must authorize the calling application to create and complete transactions.
*   **Provisioning:** Tokens are issued and rotated by USTC operations. **TODO:** link internal token issuance doc if available.
*   **Clock skew:** Allow ±60 seconds when verifying `iat`/`exp`, if applicable.

***

## Idempotency

Use the `Idempotency-Key` header to safely retry request(s) without creating duplicate charges:

    Idempotency-Key: <uuid-v4>

*   **Initiate:** The first successful call with a given key creates a transaction and returns `{ token, redirectUrl }`. Retries with the same key return the **same** response as long as inputs match.
*   **Complete:** Retrying with the same key returns the previously computed result for that token.
*   **Window:** Keys are retained for **24 hours** (configurable). **TODO:** confirm retention window.

***

## Versioning

The API is namespaced under `/v1`. Backward‑compatible changes may be added.
Breaking changes will be introduced under a new prefix (e.g., `/v2`) and noted in `CHANGELOG.md`.

***

## Rate Limits & Timeouts

*   **Client → Portal:** Recommend a client timeout of **20s** for `initiate` and **30s** for `complete` due to downstream SOAP latency. **TODO:** confirm.
*   **Portal → Pay.gov:** Retries with exponential backoff on retriable network errors.
*   **Rate limits:** If enabled, responses include `429 Too Many Requests` with `Retry-After`. **TODO:** document actual limits if configured.

***

## Errors

Responses use standard HTTP status codes plus a normalized error structure:

```json
{
  "error": {
    "code": "string",          // machine-readable error code
    "message": "string",       // human-readable summary
    "details": { },            // optional: object with field-specific hints
    "correlationId": "uuid"    // trace id for logs/support
  }
}
```

**Common error codes**

|    HTTP | code               | When                                                        |
| ------: | ------------------ | ----------------------------------------------------------- |
|     400 | `VALIDATION_ERROR` | Missing/invalid fields, schema mismatch                     |
|     401 | `UNAUTHORIZED`     | Missing/invalid bearer token                                |
|     403 | `FORBIDDEN`        | Caller not permitted for operation                          |
|     404 | `NOT_FOUND`        | Token or resource not found                                 |
|     409 | `CONFLICT`         | Token state invalid for operation (e.g., already completed) |
|     422 | `UNPROCESSABLE`    | Business rule violation                                     |
|     429 | `RATE_LIMITED`     | Too many requests                                           |
|     500 | `INTERNAL_ERROR`   | Unexpected failure                                          |
| 502/504 | `DOWNSTREAM_ERROR` | Pay.gov/transient dependency failure                        |

> Always log the `correlationId` when contacting support.

***

## Endpoints

### POST `/v1/transactions/initiate`

Initiates a Pay.gov collection session and returns a redirect URL for the end‑user.

**Headers**

    Authorization: Bearer <token>
    Content-Type: application/json
    Idempotency-Key: <uuid-v4>         // recommended

**Request body**

```json
{
  "feeId": "string",                  // required; identifies the fee schedule (v2-ready)
  "amount": 75.00,                    // required; decimal (USD)
  "currency": "USD",                  // optional; default "USD"
  "referenceId": "abc-123",           // required; your system's unique reference
  "payer": {                          // optional; metadata (not PCI/PII sensitive)
    "name": "string",
    "email": "user@example.com"
  },
  "successUrl": "https://app.example.gov/pay/success",  // required
  "cancelUrl": "https://app.example.gov/pay/cancel",    // required
  "metadata": { "caseNumber": "2026-USTC-0001" }        // optional
}
```

> **Notes**
>
> *   `feeId` is the forward‑compatible identifier for the fee being collected.
> *   Do **not** send card/PAN or sensitive payment data—Pay.gov collects it.
> *   `successUrl` and `cancelUrl` must be HTTPS and allow query parameters.

**Response (200)**

```json
{
  "token": "pg-6e0c7...cdb",
  "redirectUrl": "https://pay.gov/.../hcp?token=pg-6e0c7...cdb",
  "expiresAt": "2026-02-25T20:15:00Z"
}
```

**Validation errors (400)**

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid successUrl",
    "details": { "successUrl": "must be https" },
    "correlationId": "3a8b9c40-..."
  }
}
```

***

### POST `/v1/transactions/complete`

Completes a previously initiated transaction using the Pay.gov token.

**Headers**

    Authorization: Bearer <token>
    Content-Type: application/json
    Idempotency-Key: <uuid-v4>         // recommended

**Request body**

```json
{
  "token": "pg-6e0c7...cdb",            // required; from initiate response
  "referenceId": "abc-123"              // required; must match initiation referenceId
}
```

**Response (200)**

```json
{
  "status": "COMPLETED",
  "trackingId": "USTC-TRK-00112233",    // Pay.gov tracking / receipt identifier
  "amount": 75.00,
  "currency": "USD",
  "processedAt": "2026-02-25T20:16:30Z",
  "token": "pg-6e0c7...cdb",
  "referenceId": "abc-123",
  "metadata": {
    "feeId": "FEE-FILING-001"
  }
}
```

**Business/state errors**

*   `409 CONFLICT` with `code=CONFLICT` if token is already completed or canceled.
*   `404 NOT_FOUND` if token is unknown or expired.
*   `502/504 DOWNSTREAM_ERROR` when Pay.gov cannot be reached or returns a retriable fault.

**Example error (409)**

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "Transaction already completed",
    "correlationId": "a1b2c3d4-..."
  }
}
```

***

### GET `/v1/health`

Lightweight health check to validate liveness (and optionally readiness).

**Query params**

*   `?check=downstream` (optional) — if provided, attempts a minimal downstream check (timeouts kept short). **TODO:** confirm behavior.

**Response (200)**

```json
{ "status": "ok", "time": "2026-02-25T20:14:10Z" }
```

**Response (503)**

```json
{ "status": "degraded", "dependency": "paygov", "correlationId": "..." }
```

***

## Callback URLs

The user journey involves redirects handled by Pay.gov (or the **USTC Pay Test Server** in dev). You specify:

*   `successUrl` — The URL Pay.gov will redirect to after successful payment.
*   `cancelUrl` — The URL Pay.gov will redirect to if the user cancels.

**Portal does not call your app directly.** Your app should listen for the user’s browser return and then call `POST /v1/transactions/complete` with the original `token` and your `referenceId`.

**Recommended pattern**

1.  Initiate → receive `{ token, redirectUrl }`
2.  Redirect user to `redirectUrl`
3.  User returns to `successUrl` or `cancelUrl` (your app route)
4.  Your app invokes `/v1/transactions/complete` (server‑side)
5.  Show result to user

***

## Field Reference

| Field         | Type         | Description                                                 |
| ------------- | ------------ | ----------------------------------------------------------- |
| `feeId`       | string       | Required. Identifier for the fee to be collected.           |
| `amount`      | number       | Required. Decimal USD amount (e.g., `75.00`).               |
| `currency`    | string       | Optional; default `USD`.                                    |
| `referenceId` | string       | Required. Your system’s unique id for the transaction.      |
| `payer.name`  | string       | Optional. For receipts or audit metadata.                   |
| `payer.email` | string       | Optional. For receipts or contact.                          |
| `successUrl`  | string (url) | Required. HTTPS. Accepts query parameters.                  |
| `cancelUrl`   | string (url) | Required. HTTPS. Accepts query parameters.                  |
| `token`       | string       | Token issued after initiation; used to complete.            |
| `trackingId`  | string       | Final tracking/receipt identifier from Pay.gov.             |
| `expiresAt`   | ISO datetime | When the token or redirect session expires, if applicable.  |
| `metadata`    | object       | Optional. Free‑form key/value for your app (non‑sensitive). |

***

## Examples

### Initiate (cURL)

```bash
curl -sS -X POST "$BASE_URL/v1/transactions/initiate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "feeId":"FEE-FILING-001",
    "amount":75.00,
    "currency":"USD",
    "referenceId":"abc-123",
    "successUrl":"https://app.example.gov/pay/success",
    "cancelUrl":"https://app.example.gov/pay/cancel",
    "metadata":{"caseNumber":"2026-USTC-0001"}
  }'
```

### Complete (Node.js fetch)

```js
const res = await fetch(`${BASE_URL}/v1/transactions/complete`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
    'Idempotency-Key': crypto.randomUUID()
  },
  body: JSON.stringify({
    token: 'pg-6e0c7...cdb',
    referenceId: 'abc-123'
  })
});

if (!res.ok) {
  const err = await res.json();
  throw new Error(`${err.error.code}: ${err.error.message} [${err.error.correlationId}]`);
}

const result = await res.json();
console.log(result.trackingId);
```

***

## Testing with the USTC Pay Test Server

For local and dev testing, use the **[USTC Pay Test Server](https://github.com/ustaxcourt/ustc-pay-gov-test-server)** to simulate Pay.gov HCP:

*   Point the portal’s downstream endpoint to the test server’s SOAP endpoints.
*   The test server provides a simple UI with success/cancel buttons to mimic user behavior.
*   Your app should still follow the same initiate → redirect → complete pattern.

**TODO:** Add a quickstart snippet linking `running-locally.md` once finalized.

***

## Security & Compliance Notes

*   **No PAN or sensitive payment data** passes through the portal—Pay.gov collects those details.
*   Ensure logs **exclude tokens and PII**.
*   Follow input validation guidance and use HTTPS everywhere.
*   For vulnerabilities, follow **`/SECURITY.md`** (no public issues).

***

## Changelog

*   **v1.0** — Initial publication of API reference (initiate/complete/health, error model, idempotency).

***

### Feedback

If anything here is unclear or you need a new endpoint/field, please open a **Documentation Update** issue or a **Feature Request** with concrete examples.
