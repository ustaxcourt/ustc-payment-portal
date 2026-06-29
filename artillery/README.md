# Artillery Load-Test Runbook

This directory contains the Artillery load-test scenarios, target profiles, processor logic, and saved result artifacts for the PAY-329 spike.

## Files

- `scenarios/init-only.yml` exercises only `POST /init`
- `scenarios/full-flow.yml` exercises `/init`, simulated Pay.gov, `/process`, and `/details/{transactionReferenceId}`
- `environments/1000-rpm.yml` launches 17 new virtual users per second for 300 seconds
- `environments/10000-rpm.yml` launches 167 new virtual users per second for 300 seconds
- `processor.js` generates payloads, signs deployed requests with SigV4, sets the simulated Pay.gov auth header, and logs failed responses
- `results/*.json` stores Artillery JSON output

## Naming Caveat

The `1000-rpm` and `10000-rpm` profile names refer to approximate flow starts per minute, not literal HTTP requests per minute.

- `17` arrivals per second is about `1,020` scenario starts per minute.
- `167` arrivals per second is about `10,020` scenario starts per minute.
- A successful `full-flow` user can emit up to 4 HTTP requests and includes 3 seconds of think time, so request rate will differ from scenario start rate.

## Prerequisites

### Local target

- Start the local stack from the repository root with `npm run start:all`.
- The default Artillery target is `http://localhost:8080`.
- Full-flow scenarios call the local Pay.gov simulator at `http://localhost:3366`.

### Deployed target

- Set `AWS_ACCESS_KEY_ID`.
- Set `AWS_SECRET_ACCESS_KEY`.
- Set `AWS_SESSION_TOKEN` when using temporary credentials.
- Set `SIGV4_REGION` if the API is not in `us-east-1`.
- For full-flow runs, set `PAY_GOV_DEV_SERVER_ACCESS_TOKEN`.

## Scenario Behavior

### `init-only`

- Creates a unique `transactionReferenceId`.
- Sends `POST /init`.
- Applies SigV4 signing when the target host is not localhost.
- Expects HTTP `200` and captures the payment token.

Use this scenario to isolate ingestion behavior and request signing.

### `full-flow`

- Creates a unique `transactionReferenceId`.
- Sends `POST /init`.
- Waits 1 second.
- Chooses a random payment method and success or failure outcome.
- Calls the simulated Pay.gov `/pay/...` endpoint.
- Waits 1 second.
- Sends `POST /process`.
- Waits 1 second.
- Sends `GET /details/{transactionReferenceId}`.

Use this scenario to measure end-to-end flow completion, dependency behavior, and failure propagation.

## Processor Notes

- `processor.js` only applies SigV4 signing for non-local targets.
- For deployed full-flow runs, the simulated payment step is hard-wired to `https://pay-gov-dev.ustaxcourt.gov`.
- Failed responses, or all responses when `ARTILLERY_DEBUG_RESPONSES=1`, are logged with auth headers redacted.
- Both environment files set `ensure.maxErrorRate` to `10`, so Artillery should treat runs above that threshold as failed.

## Run Commands

Run these commands from the repository root, not from this directory.

### Local runs

```bash
npm run artillery:1000:init
npm run artillery:1000:full
npm run artillery:10000:init
npm run artillery:10000:full
```

### Deployed runs

```bash
npm run artillery:1000:init --target=https://your-api-endpoint.com
npm run artillery:1000:full --target=https://your-api-endpoint.com
npm run artillery:10000:init --target=https://your-api-endpoint.com
npm run artillery:10000:full --target=https://your-api-endpoint.com
```

## Results and Interpretation

- Result files are written to `artillery/results/`.
- Read request-level metrics such as `http.codes.200`, `http.codes.429`, and `http.codes.500` separately from flow-level metrics such as `vusers.completed` and `vusers.failed`.
- A run can show many successful individual requests while still having a poor end-to-end flow completion rate.
- The findings and interpretation for the saved PAY-329 artifacts live in the [Load Testing docs](../docs/architecture/proposals/PAY-329-load-testing/README.md).

## Manual Request Debugging

These examples mirror the request shapes used by the scenarios and are useful when debugging signing or endpoint behavior outside Artillery.

### Initialization request

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

### Processing request

```bash
curl -X POST "https://dev-payments.ustaxcourt.gov/process" \
  --aws-sigv4 "aws:amz:us-east-1:execute-api" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" \
  -H "x-amz-security-token: $AWS_SESSION_TOKEN" \
  -d '{
    "token": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

### Simulated payment outcome request

```bash
curl -X POST "https://pay-gov-dev.ustaxcourt.gov/pay/<choiceMethod>/<choiceStatus>?token=<paymentToken>" \
  -H "Authorization: Bearer $PAY_GOV_DEV_SERVER_ACCESS_TOKEN"
```

### Details request

```bash
curl -X GET "https://dev-payments.ustaxcourt.gov/details/550e8400-e29b-41d4-a716-446655440000" \
  --aws-sigv4 "aws:amz:us-east-1:execute-api" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" \
  -H "x-amz-security-token: $AWS_SESSION_TOKEN"
```
