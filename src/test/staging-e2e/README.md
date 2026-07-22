# Staging Pay.gov E2E

This suite is the thin staging-only Pay.gov gate. It signs portal requests with AWS SigV4, opens the real Pay.gov QA hosted payment page in Playwright, completes a credit-card success flow, then verifies `/process` and `/details`.

## Prerequisites

- AWS credentials for the staging account must be available in the current shell.
- The calling role must be authorized for `NONATTORNEY_EXAM_REGISTRATION_FEE` in staging client permissions.
- Playwright Chromium must be installed locally.
- Official Pay.gov QA test card credentials must be available. Do **not** commit them to source control.

## Local Environment Configuration

Start from the checked-in example file:

```bash
cp .env.staging.local.example .env.staging.local
```

Then update `.env.staging.local` with your local staging values.

The runtime file is:

```text
.env.staging.local
```

This file is loaded automatically by the Playwright configuration and should remain untracked by Git. The committed template is `.env.staging.local.example`.

Example:

### Staging API Gateway URL

```
BASE_URL=https://<staging-api-url>
```

### Pay.gov QA test card

```
PAYGOV_QA_CC_SUCCESS_PAN=<provided-by-fiscal>
PAYGOV_QA_CC_SUCCESS_EXP=MM/YY
PAYGOV_QA_CC_SUCCESS_CVV=<provided-by-fiscal>
PAYGOV_QA_CC_SUCCESS_NAME=Staging E2E
```

### Optional redirect overrides

```
PAYGOV_URL_SUCCESS=https://example.com
PAYGOV_URL_CANCEL=https://example.com
```

### BASE_URL

The suite expects the Payment Portal API URL, not the frontend website URL.

You can obtain it from Terraform:

```
terraform -chdir=terraform/environments/stg output -raw api_gateway_url
```

Example:

```
BASE_URL=https://xxxxxxxx.execute-api.us-east-1.amazonaws.com/stg
```

Pay.gov QA Test Card

The following values must come from the official Pay.gov QA test instruments provided by Fiscal/Pay.gov:

```
PAYGOV_QA_CC_SUCCESS_PAN=...
PAYGOV_QA_CC_SUCCESS_EXP=...
PAYGOV_QA_CC_SUCCESS_CVV=...
```

Do **not** commit these values to Git.

AWS Authentication

Authenticate to the staging AWS account:

```
aws sso login --profile ent-apps-payment-portal-workloads-stg
```

Export temporary credentials into the current shell:

```
export AWS_PROFILE=ent-apps-payment-portal-workloads-stg
export AWS_SDK_LOAD_CONFIG=1

eval "$(aws configure export-credentials --profile "$AWS_PROFILE" --format env)"
```

Verify credentials are available:

```
env | grep AWS\_
```

Expected output includes:

```
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_SESSION_TOKEN=...
```

Playwright Installation

Install Chromium once:

```
npx playwright install chromium
```

Run

```
npm run test:staging-e2e
```

Useful Commands

Open the latest Playwright report:

```
npm run test:staging-e2e:report
```

## Troubleshooting

### ENV_MISSING

One or more required variables are missing from .env.staging.local.

Required:

```
BASE_URL
PAYGOV_QA_CC_SUCCESS_PAN
PAYGOV_QA_CC_SUCCESS_EXP
PAYGOV_QA_CC_SUCCESS_CVV
```

### AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set

AWS credentials have not been exported into the current shell.

Re-run:

```
aws sso login --profile ent-apps-payment-portal-workloads-stg

export AWS_PROFILE=ent-apps-payment-portal-workloads-stg
export AWS_SDK_LOAD_CONFIG=1

eval "$(aws configure export-credentials --profile "$AWS_PROFILE" --format env)"
```

### HTTP 404 during /init

Verify that BASE_URL points to the Staging API Gateway URL and not the frontend website URL.

## Artifacts

On failure, Playwright retains:

- Video recordings
- Execution traces
- Failure screenshots

Artifacts are written under:

```
test-results/
playwright-report/
```

The suite also writes:

```
failure-summary.json
```

at the repository root to provide a machine-readable summary for debugging and CI artifact uploads.
