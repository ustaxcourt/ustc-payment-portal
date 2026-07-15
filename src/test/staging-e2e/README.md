# Staging Pay.gov E2E

This suite is the thin staging-only Pay.gov gate. It signs portal requests with AWS SigV4, opens the real Pay.gov QA hosted payment page in Playwright, completes a credit-card success flow, then verifies `/process` and `/details`.

## Prerequisites

- AWS credentials for the staging account must be exported into the current shell.
- The calling role must be authorized for `NONATTORNEY_EXAM_REGISTRATION_FEE` in staging client permissions.
- Playwright Chromium must be installed locally.

Typical local setup:

```bash
aws sso login --profile ent-apps-payment-portal-workloads-stg
export AWS_PROFILE=ent-apps-payment-portal-workloads-stg
export AWS_SDK_LOAD_CONFIG=1
eval "$(aws configure export-credentials --profile "$AWS_PROFILE" --format env)"
```

## Required environment variables

- `BASE_URL`
- `PAYGOV_QA_CC_SUCCESS_PAN`
- `PAYGOV_QA_CC_SUCCESS_EXP`
- `PAYGOV_QA_CC_SUCCESS_CVV`
- `PAYGOV_QA_CC_SUCCESS_NAME` (optional)

Optional redirect overrides:

- `PAYGOV_URL_SUCCESS`
- `PAYGOV_URL_CANCEL`

`BASE_URL` can be sourced from Terraform outputs:

```bash
export BASE_URL="$(terraform -chdir=terraform/environments/stg output -raw api_gateway_url)"
```

Install the browser once locally:

```bash
npx playwright install chromium
```

## Run

```bash
npm run test:staging-e2e
```

On failure, Playwright retains video, trace, and screenshots under `test-results/` and `playwright-report/`, and the suite writes `failure-summary.json` at the repo root.
