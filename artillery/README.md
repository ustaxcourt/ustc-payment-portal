# How To Run Artillery Load Tests

## Objectives and Expected Outputs

This spike is intended to produce **measurable, actionable findings** about the system’s behavior under load. Specifically, the following outcomes are required:

- Establish baseline system performance under moderate load (1,000 RPM)
- Evaluate system behavior under stress conditions (10,000 RPM)
- Identify bottlenecks across:
  - API Gateway
  - Lambda/backend services
  - External integrations (Pay.gov simulation)
- Validate request signing (SigV4) under load conditions
- Quantify error rates and latency distributions

---

## Test Execution

### Example: Signed Request via `curl` (SigV4)

These examples demonstrate how requests are signed and sent outside Artillery for validation/debugging.

---

### Initialization Request

```bash
curl -X POST "https://dev-payments.ustaxcourt.gov/init" \
  --aws-sigv4 "aws:amz:us-east-1:execute-api" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" \
  -H "x-amz-security-token: $AWS_SESSION_TOKEN" \
  -H "Host: dev-payments.ustaxcourt.gov" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{
    "transactionReferenceId": "550e8400-e29b-41d4-a716-446655440000",
    "fee": "PETITION_FILING_FEE",
    "urlSuccess": "https://client.app/success",
    "urlCancel": "https://client.app/cancel",
    "metadata": {
      "docketNumber": "123-26"
    }
  }'
```

---

### Processing Request

```bash
curl -X POST "https://dev-payments.ustaxcourt.gov/process" \
  --aws-sigv4 "aws:amz:us-east-1:execute-api" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" \
  -H "x-amz-security-token: $AWS_SESSION_TOKEN" \
  -d '{
    "token": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

---

### Choose Payment Outcome Request

```bash
curl -X POST "https://dev-payments.ustaxcourt.gov/pay/<choiceMethod>/<choiceStatus>?token=<paymentToken>" \
   -H "Authorization: $PAY_GOV_DEV_SERVER_ACCESS_TOKEN"
```

---

### Details Request

```bash
curl -X GET "https://dev-payments.ustaxcourt.gov/details/550e8400-e29b-41d4-a716-446655440000" \
  --aws-sigv4 "aws:amz:us-east-1:execute-api" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" \
  -H "x-amz-security-token: $AWS_SESSION_TOKEN"
```

---

## Notes

- Ensure the following environment variables are set:

  - `AWS_ACCESS_KEY_ID`
  - `AWS_SECRET_ACCESS_KEY`
  - `AWS_SESSION_TOKEN` (required for temporary credentials)

- SigV4 scope must match:

  - **Service:** `execute-api`
  - **Region:** `us-east-1`

- The `Host` header must match the API Gateway domain exactly

- This request flow mirrors what is executed in Artillery scenarios

---

## Test Scenarios

### Init-Only

- Executes only the `/init` endpoint
- Uses SigV4 signing via processor
- Captures `paymentToken`

Use cases:

- Isolate API Gateway + Lambda performance
- Validate signing behavior under load
- Debug authentication issues

---

### Full Flow

Executes the complete payment lifecycle:

1. `POST /init`
2. Pay.gov simulation (`/pay/...`)
3. `POST /process`
4. `GET /details`

Validates:

- End-to-end system behavior
- State propagation across requests
- External dependency impact

---

## Run Artillery Tests (Local)

```bash
cd artillery

# Default target: http://localhost:8080
npm run artillery:1000:full
npm run artillery:1000:init
npm run artillery:10000:full
npm run artillery:10000:init
```

### Run Against API Gateway

```bash
cd artillery

npm run artillery:1000:full --target=https://your-api-endpoint.com
npm run artillery:1000:init --target=https://your-api-endpoint.com
npm run artillery:10000:full --target=https://your-api-endpoint.com
npm run artillery:10000:init --target=https://your-api-endpoint.com
```

---

## Prerequisites

- AWS credentials configured (`aws configure` or env vars)
- Artillery installed (`npm install -g artillery` or `npx artillery`)
- `processor.js` handles:
  - Payload generation
  - SigV4 signing
  - Token/header injection

---

## Known Issue: 403 Errors During Early Runs

Initial test executions produced a high rate of **403 responses**.

### Root Cause

- Incorrect or incomplete **SigV4 signing**
- Missing headers or token mismatch
- Misconfigured request body vs signed payload

### Impact

- Errors were **authentication-related**, not system capacity issues
- Early results should not be used for performance conclusions

---

## Findings Narrative

### Phase 1: Initial Runs

- High 403 error rate observed
- Requests failing before reaching backend logic

### Phase 2: After Fixes

- SigV4 signing corrected
- Successful request throughput increased
- Backend performance became measurable

### Key Insight

> The primary bottleneck in early testing was **request authentication**, not infrastructure scalability.

---

## Interpreting Results

Key metrics to evaluate:

- **Status Codes**

  - `200`: success
  - `403`: signing/auth failure
  - `5xx`: backend/system failure

- **Latency (p95/p99)**

  - Indicates performance under load
  - More meaningful after auth issues resolved

- **Error Rate**
  - Should exclude known auth failures when analyzing system behavior

---

## Sample Results

Example: 1,000 RPM full-flow test in the Artillery Dashboard.

<img src="images/Screenshot 1000-rpm-results.png" alt="Artillery Dashboard" width="600" />
