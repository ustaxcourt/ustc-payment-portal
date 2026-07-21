# Artillery Load-Test Runbook

This directory contains the Artillery scenarios, traffic profiles, processor hooks, and saved result artifacts used for load testing the payment portal.

The six `npm run test:performance:*` scripts in [package.json](../../../../package.json) execute [scripts/run-performance-test.sh](../../../../scripts/run-performance-test.sh), which builds the paths and wraps `artillery run-lambda`. These runbooks are therefore for Lambda-backed Artillery runs against deployed or otherwise network-reachable targets, not for hitting a developer's local `localhost` stack.

## Files

- `scenarios/init-only.yml` exercises `POST /init` only.
- `scenarios/full-flow.yml` exercises `/init`, the simulated Pay.gov payment step, `/process`, and `/details/{transactionReferenceId}`.
- `environments/1000-rpm.yml` launches `17` new virtual users per second for `300` seconds.
- `environments/10000-rpm.yml` launches `167` new virtual users per second for `300` seconds.
- `environments/10000-rpm-ramp.yml` ramps from `33` to `167` new virtual users per second over five one-minute phases.
- `processor.js` builds request payloads, conditionally applies SigV4, selects payment outcomes, and logs failed responses with auth values redacted.
- `results/*.json` stores Artillery JSON output.
- `.env.example` shows the environment variables expected by the Lambda wrapper and processor.

## Script Map

These repository scripts create a timestamped directory under `src/test/performance/artillery/results/` if needed and then run one Lambda-backed Artillery test:

- `npm run test:performance:1000:init`
  - Scenario: `scenarios/init-only.yml`
  - Config: `environments/1000-rpm.yml`
  - Output: `results/<timestamp>/1000-rpm-init-results.json`
- `npm run test:performance:1000:full`
  - Scenario: `scenarios/full-flow.yml`
  - Config: `environments/1000-rpm.yml`
  - Output: `results/<timestamp>/1000-rpm-full-results.json`
- `npm run test:performance:10000:init`
  - Scenario: `scenarios/init-only.yml`
  - Config: `environments/10000-rpm.yml`
  - Output: `results/<timestamp>/10000-rpm-init-results.json`
- `npm run test:performance:10000:full`
  - Scenario: `scenarios/full-flow.yml`
  - Config: `environments/10000-rpm.yml`
  - Output: `results/<timestamp>/10000-rpm-full-results.json`
- `npm run test:performance:10000ramp:init`
  - Scenario: `scenarios/init-only.yml`
  - Config: `environments/10000-rpm-ramp.yml`
  - Output: `results/<timestamp>/10000ramp-rpm-init-results.json`
- `npm run test:performance:10000ramp:full`
  - Scenario: `scenarios/full-flow.yml`
  - Config: `environments/10000-rpm-ramp.yml`
  - Output: `results/<timestamp>/10000ramp-rpm-full-results.json`

## Naming Caveat

The `1000-rpm` and `10000-rpm` names are approximate scenario-start rates, not literal HTTP requests per minute.

- `17` arrivals per second is about `1,020` scenario starts per minute.
- `167` arrivals per second is about `10,020` scenario starts per minute.
- A successful `full-flow` user can emit up to four HTTP requests and includes three one-second think times, so request-per-minute numbers will differ from scenario-start rate.

## How The Wrapper Works

[scripts/run-performance-test.sh](../../../../scripts/run-performance-test.sh) does the following before invoking Artillery:

- Sources and exports values from `src/test/performance/artillery/.env`.
- Requires `ARTILLERY_LAMBDA_ROLE_ARN` to be present.
- Uses `ARTILLERY_TARGET` from `src/test/performance/artillery/.env`, defaulting to a deployed payments URL if unset.
- Uses `ARTILLERY_LAMBDA_REGION`, `AWS_REGION`, or `AWS_DEFAULT_REGION` for the Lambda worker region, defaulting to `us-east-1`.
- Uses `ARTILLERY_LAMBDA_COUNT`, defaulting to `1`.
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
5. Set `ARTILLERY_LAMBDA_COUNT` if you want more than one Lambda worker.
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

### Baseline profile

```bash
npm run test:performance:1000:init
npm run test:performance:1000:full
```

### Stress profile

```bash
npm run test:performance:10000:init
npm run test:performance:10000:full
npm run test:performance:10000ramp:init
npm run test:performance:10000ramp:full
```

## Results And Interpretation

- Result files are written to timestamped directories under `src/test/performance/artillery/results/` using names derived by the Bash wrapper.
- Read request-level metrics such as `http.codes.200`, `http.codes.429`, and `http.codes.500` separately from flow-level metrics such as `vusers.completed` and `vusers.failed`.
- A run can show many successful individual requests while still having poor end-to-end flow completion.
- `environments/1000-rpm.yml` sets `ensure.maxErrorRate` to `10`.
- `environments/10000-rpm.yml` sets `ensure.maxErrorRate` to `100`.
- `environments/10000-rpm-ramp.yml` sets `ensure.maxErrorRate` to `100` and ramps traffic to the same peak arrival rate as the steady `10000-rpm` profile.

## Debugging Notes

- Set `ARTILLERY_DEBUG_RESPONSES=1` in `src/test/performance/artillery/.env` to log every response payload during a run.
- Failed responses are already logged by default.
- If you need to change the target, update `ARTILLERY_TARGET` in `src/test/performance/artillery/.env` before rerunning the script.
- If you need to inspect the raw scenario definitions or hooks, see [init-only.yml](./scenarios/init-only.yml), [full-flow.yml](./scenarios/full-flow.yml), and [processor.js](./processor.js).
