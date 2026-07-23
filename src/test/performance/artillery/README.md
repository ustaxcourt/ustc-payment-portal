# Artillery Load-Test Runbook

This directory contains the Artillery scenarios, traffic profiles, processor hooks, and saved result artifacts used for load testing the payment portal.

The four `npm run test:performance:*` scripts in [package.json](../../../../package.json) execute [scripts/run-performance-test.sh](../../../../scripts/run-performance-test.sh), which builds the paths and wraps `artillery run-lambda`. These runbooks are therefore for Lambda-backed Artillery runs against deployed or otherwise network-reachable targets, not for hitting a developer's local `localhost` stack.

## Files

- `scenarios/init-only.yml` exercises `POST /init` only.
- `scenarios/full-flow.yml` exercises `/init`, the simulated Pay.gov payment step, `/process`, and `/details/{transactionReferenceId}`.
- `environments/load-test.yml` launches `7` new virtual users per second per worker for `300` seconds. With two workers, `full-flow` produces approximately `42` payment-portal requests per second.
- `environments/stress-test.yml` increases traffic from `5` to `15` new virtual users per second per worker over five one-minute phases.
- `processor.js` builds request payloads, conditionally applies SigV4, selects payment outcomes, and logs failed responses with auth values redacted.
- `results/*.json` stores Artillery JSON output.
- `.env.example` shows the environment variables expected by the Lambda wrapper and processor.

## Script Map

These repository scripts create a timestamped directory under `src/test/performance/artillery/results/` if needed and then run one Lambda-backed Artillery test:

- `npm run test:performance:load:init`
  - Scenario: `scenarios/init-only.yml`
  - Config: `environments/load-test.yml`
  - Output: `results/<timestamp>/load-test-init-results.json`
- `npm run test:performance:load:full`
  - Scenario: `scenarios/full-flow.yml`
  - Config: `environments/load-test.yml`
  - Output: `results/<timestamp>/load-test-full-results.json`
- `npm run test:performance:stress:init`
  - Scenario: `scenarios/init-only.yml`
  - Config: `environments/stress-test.yml`
  - Output: `results/<timestamp>/stress-test-init-results.json`
- `npm run test:performance:stress:full`
  - Scenario: `scenarios/full-flow.yml`
  - Config: `environments/stress-test.yml`
  - Output: `results/<timestamp>/stress-test-full-results.json`

## Arrival Rates

- The configured arrival rates represent scenario starts, not literal HTTP requests per second.
- A successful `full-flow` user emits three payment-portal requests plus one request to the simulated Pay.gov server and includes three one-second think times.
- The load profile verifies the demonstrated-safe rate only when `ARTILLERY_LAMBDA_COUNT=2`: `7` scenario starts per second per worker × `2` workers × `3` payment-portal requests = approximately `42` payment-portal requests per second for five minutes.

## How The Wrapper Works

[scripts/run-performance-test.sh](../../../../scripts/run-performance-test.sh) does the following before invoking Artillery:

- Sources and exports values from `src/test/performance/artillery/.env`.
- Requires `ARTILLERY_LAMBDA_ROLE_ARN` to be present.
- Uses `ARTILLERY_TARGET` from `src/test/performance/artillery/.env`, defaulting to a deployed payments URL if unset.
- Uses `ARTILLERY_LAMBDA_REGION`, `AWS_REGION`, or `AWS_DEFAULT_REGION` for the Lambda worker region, defaulting to `us-east-1`.
- Uses `ARTILLERY_LAMBDA_COUNT`, defaulting to `1`. Each Lambda worker runs the configured `arrivalRate`, so the approximate aggregate arrival rate is `arrivalRate * ARTILLERY_LAMBDA_COUNT`. For example, `arrivalRate: 10` with `ARTILLERY_LAMBDA_COUNT=5` produces approximately 50 arrivals per second.
- Namespaces Artillery's reusable worker Lambda by `ARTILLERY_LAMBDA_ROLE_ARN`. Artillery normally reuses one deterministic function for a version and architecture without updating its execution role, which can otherwise cause a dev run to reuse a function created with a PR role.
- Appends the matching `--dotenv`, `--target`, `--region`, `--count`, and `--lambda-role-arn` options to the `artillery run-lambda` command.

Operational implications:

- Do not rely on passing `--target ...` after `npm run test:performance:*`; the wrapper appends its own `--target` afterward, so `ARTILLERY_TARGET` in `src/test/performance/artillery/.env` is the effective source of truth.
- These scripts are intended for targets reachable from the Lambda worker. A developer's local `http://localhost:8080` stack is not a valid target for this wrapper.
- If the API's SigV4 signing region differs from the Lambda execution region, set `SIGV4_REGION` in `src/test/performance/artillery/.env` for request signing.

## Prerequisites

1. Copy `src/test/performance/artillery/.env.example` to `src/test/performance/artillery/.env`.
2. Set `ARTILLERY_TARGET` to the API base URL you intend to load test.
3. Set `ARTILLERY_LAMBDA_ROLE_ARN` to the IAM role ARN used by `artillery run-lambda`.
4. Set `PAY_GOV_DEV_SERVER_ACCESS_TOKEN` for `full-flow` runs.
5. Set `ARTILLERY_LAMBDA_COUNT` if you want more than one Lambda worker, accounting for its multiplication of the configured `arrivalRate`.
6. Set `ARTILLERY_LAMBDA_REGION` if the load generator should run outside the default region.
7. Set `SIGV4_REGION` if the API Gateway signing region differs from the Lambda worker region.

Example `src/test/performance/artillery/.env` values with placeholders only:

```dotenv
ARTILLERY_TARGET=https://your-payments-api.example.gov
ARTILLERY_LAMBDA_ROLE_ARN=arn:aws:iam::<account-id>:role/<artillery-lambda-role>
PAY_GOV_DEV_SERVER_ACCESS_TOKEN=<pay-gov-dev-server-access-token>
ARTILLERY_LAMBDA_COUNT=5
ARTILLERY_LAMBDA_REGION=us-east-1
SIGV4_REGION=us-east-1
ARTILLERY_DEBUG_RESPONSES=0
```

## Scenario Behavior

### `init-only`

- Generates a unique `transactionReferenceId`.
- Sends `POST /init`.
- Applies SigV4 signing when the target host is not localhost.
- Expects HTTP `200` and captures the returned payment token.

Use this scenario to isolate ingestion behavior, authorization behavior, and request-signing behavior.

### `full-flow`

- Generates a unique `transactionReferenceId`.
- Sends `POST /init`.
- Waits one second.
- Randomly chooses a payment method and success or failure outcome.
- Calls the simulated Pay.gov `/pay/...` endpoint.
- Waits one second.
- Sends `POST /process`.
- Waits one second.
- Sends `GET /details/{transactionReferenceId}`.

Use this scenario to measure end-to-end flow completion, downstream dependency behavior, and failure propagation.

## Processor Notes

[processor.js](./processor.js) currently behaves as follows:

- `signWithSigV4IfNeeded` signs `/init`, `/process`, and `/details` requests for non-local targets.
- `setPaymentOutcome` points the simulated payment step at `http://localhost:3366` for local targets and at a deployed Pay.gov dev host for non-local targets.
- `setTokenHeader` adds a bearer token from `PAY_GOV_DEV_SERVER_ACCESS_TOKEN` for the simulated payment call.
- `logResponse` logs all `4xx` and `5xx` responses, plus all responses when `ARTILLERY_DEBUG_RESPONSES=1`, with auth headers redacted.

## Running Tests

Run these commands from the repository root.

### Load profile

```bash
npm run test:performance:load:init
npm run test:performance:load:full
```

### Stress profile

```bash
npm run test:performance:stress:init
npm run test:performance:stress:full
```

## Results And Interpretation

- Result files are written to timestamped directories under `src/test/performance/artillery/results/` using names derived by the Bash wrapper.
- Read request-level metrics such as `http.codes.200`, `http.codes.429`, and `http.codes.500` separately from flow-level metrics such as `vusers.completed` and `vusers.failed`.
- A run can show many successful individual requests while still having poor end-to-end flow completion.
- The load profile requires a zero-percent error rate; the stress profile allows up to a ten-percent error rate while finding the target's limit.
- `load-test.yml` holds a steady arrival rate, while `stress-test.yml` increases the arrival rate in one-minute steps.

## Debugging Notes

- Set `ARTILLERY_DEBUG_RESPONSES=1` in `src/test/performance/artillery/.env` to log every response payload during a run.
- Failed responses are already logged by default.
- If you need to change the target, update `ARTILLERY_TARGET` in `src/test/performance/artillery/.env` before rerunning the script.
- If you need to inspect the raw scenario definitions or hooks, see [init-only.yml](./scenarios/init-only.yml), [full-flow.yml](./scenarios/full-flow.yml), and [processor.js](./processor.js).
