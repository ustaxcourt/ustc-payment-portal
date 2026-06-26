## Objectives and Expected Outputs

This spike is intended to produce measurable, actionable findings about the system’s behavior under load. Specifically, the following outcomes are required.

---

## Test Execution

### Example: Signed Request via `curl` (SigV4)

```bash
curl -X POST "https://aplnu5xea1.execute-api.us-east-1.amazonaws.com/pr-292/init" \
  --aws-sigv4 "aws:amz:us-east-1:execute-api" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" \
  -H "x-amz-security-token: $AWS_SESSION_TOKEN" \
  -H "Host: aplnu5xea1.execute-api.us-east-1.amazonaws.com" \
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

### Notes

- Ensure the following environment variables are set:

  - `AWS_ACCESS_KEY_ID`
  - `AWS_SECRET_ACCESS_KEY`
  - `AWS_SESSION_TOKEN` (required for temporary credentials)

- The SigV4 scope must match:

  - **Service:** `execute-api`
  - **Region:** `us-east-1`

- The `Host` header must match the API Gateway domain exactly

- This request exercises the `/init` endpoint used in load testing scenarios

---

### Run Artillery Tests (Local)

Run Artillery tests locally by combining scenario files with environment (load) configurations.

> When using `--record`, Artillery will automatically upload results to Artillery Cloud and generate a hosted report/dashboard for the run.

> Results are also saved locally via `--output` for offline analysis and HTML report generation.

Example:

```bash
# Make sure you have Artillery installed globally or use npx
cd artillery

# Full Flow (1,000 RPM)
artillery run scenarios/full-flow.yml \
  --config environments/1000-rpm.yml \
  --target https://dev-payments.ustaxcourt.gov \
  --output results/1000-rpm.json \
  --key <api_key> \
  --name "Full Flow 1,000 RPM" \
  --record

# Stress (10,000 RPM)
artillery run scenarios/init-only.yml \
  --config environments/10000-rpm.yml \
  --target https://dev-payments.ustaxcourt.gov \
  --output results/10000-rpm-results.json \
  --key <api_key> \
  --name "Load Test - 10,000 RPM" \
  --record

# Ramp (threshold identification)
artillery run scenarios/full-flow.yml \
  --config environments/ramp-test.yml \
  --target https://dev-payments.ustaxcourt.gov \
  --output results/ramp-test-results.json \
  --key <api_key> \
  --name "Load Test - Ramp Test" \
  --record
```

---

## Run Artillery Tests (AWS Lambda - Distributed Load)

Use AWS Lambda to generate distributed, high-scale load. This is recommended for realistic performance testing beyond local machine limits.

> **Important:** The `target` in your config **must NOT be `localhost`**. It must be a publicly reachable endpoint (e.g., API Gateway, dev environment URL).

### Prerequisites

- AWS credentials configured (`aws configure` or environment variables)
- IAM permissions for Lambda, S3, SQS (AdministratorAccess is acceptable for testing)

---

### Example Commands

```bash
# Make sure you have Artillery installed globally or use npx
cd artillery

# Baseline (1,000 RPM)
artillery run-lambda scenarios/init-only.yml \
  --config environments/1000-rpm.yml \
  --target https://your-api-endpoint.com \
  --output results/1000-rpm-results.json \
  --region us-west-2 \
  --key <api_key> \
  --name "Full Flow 1,000 RPM" \
  --record \
  --count 2

# Stress (10,000 RPM)
artillery run-lambda scenarios/init-only.yml \
  --config environments/10000-rpm.yml \
  --target https://your-api-endpoint.com \
  --output results/10000-rpm-results.json \
  --region us-west-2 \
  --key <api_key> \
  --name "Full Flow 1,000 RPM" \
  --record \
  --count 10

# Ramp (threshold identification)
artillery run-lambda scenarios/full-flow.yml \
  --config environments/ramp-test.yml \
  --target https://your-api-endpoint.com \
  --output results/ramp-test-results.json \
  --region us-west-2 \
  --key <api_key> \
  --name "Full Flow 1,000 RPM" \
  --record \
  --count 5
```

---

### Notes on Lambda Execution

- **`--count` controls the number of distributed load generators**
  Each worker runs your scenario independently.

- **Total load is multiplied across workers**

  ```
  total load ≈ config load × count
  ```

- **Maximum test duration is \~15 minutes** (Lambda limit)

- All scenario files, configs, and JS processors are **automatically bundled and uploaded**

---

Here’s a **clean, review-ready fix** that aligns your narrative with the actual results (403-heavy runs) **without throwing away the work**.

The key is to reframe this as:

> “We initially hit auth/signing issues, then fixed them, and later runs show different behavior”

## Sample Results Table

Here's a screenshot of the Artillery Cloud dashboard for the 1,000 RPM full-flow test:

<img src="images/Screenshot 1000-rpm-results.png" alt="Artillery Dashboard" width="600" />
