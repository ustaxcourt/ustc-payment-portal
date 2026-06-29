# PAY-329: Load Testing Findings

This document summarizes the saved Artillery artifacts under `artillery/results/` and records what they show about the current load-test spike.

## Scope and Caveats

- The how-to guidance for running Artillery lives in `artillery/README.md`.
- The saved result files are the source of truth for the numbers below.
- The `1000-rpm` and `10000-rpm` profile names describe approximate flow starts per minute, not literal HTTP requests per minute.
- The two full-flow artifacts match the current 300-second environment files.
- The two init-only artifacts do not match the current 300-second environment files and appear to come from shorter runs.
- Request-level success and flow-level success are different metrics and need to be interpreted separately.

## Saved Result Set

| Artifact                                        | Scenario    | Notes                                                                  |
| ----------------------------------------------- | ----------- | ---------------------------------------------------------------------- |
| `artillery/results/1000-rpm-init-results.json`  | `init-only` | Older or shortened run; `60` users created rather than about `5100`    |
| `artillery/results/10000-rpm-init-results.json` | `init-only` | Older or shortened run; `5010` users created rather than about `50100` |
| `artillery/results/1000-rpm-full-results.json`  | `full-flow` | Matches current `17 arrivals/sec for 300s` profile                     |
| `artillery/results/10000-rpm-full-results.json` | `full-flow` | Matches current `167 arrivals/sec for 300s` profile                    |

## Results Summary

### `1000-rpm-init-results.json`

- Virtual users created: `60`
- Virtual users completed: `52`
- Virtual users failed: `8`
- HTTP `200`: `52`
- HTTP `429`: `8`
- Overall mean response time: `303.6 ms`
- Overall p95 response time: `459.5 ms`
- Successful-request mean response time: `335.5 ms`

Interpretation:

- This was a short `init-only` run, not a current 5-minute profile run.
- Even in this small sample, `/init` experienced throttling.

### `10000-rpm-init-results.json`

- Virtual users created: `5010`
- Virtual users completed: `312`
- Virtual users failed: `4698`
- HTTP `200`: `312`
- HTTP `429`: `4659`
- HTTP `500`: `39`
- Overall mean response time: `181.2 ms`
- Overall p95 response time: `368.8 ms`
- Successful-request mean response time: `876.0 ms`
- Successful-request p95 response time: `2618.1 ms`

Interpretation:

- This was also a shortened `init-only` run.
- The dominant failure mode was `/init` throttling, with a small number of server errors.
- The low overall mean is misleading because fast failures dominate the sample.

### `1000-rpm-full-results.json`

- Virtual users created: `5100`
- Virtual users completed: `3015`
- Virtual users failed: `2085`
- HTTP `200`: `11955`
- HTTP `429`: `2190`
- Overall mean response time: `321.9 ms`
- Overall p95 response time: `507.8 ms`
- Successful-request mean response time: `359.8 ms`
- Successful-request p95 response time: `539.2 ms`
- `/init` mean response time: `288.1 ms`
- `/process` mean response time: `463.6 ms`
- `/details` mean response time: `277.5 ms`

Interpretation:

- This run was not stable at the flow level.
- The main failure mode was HTTP `429`, mostly at `/init`.
- `/process` was the slowest successful step in the end-to-end flow.
- The saved artifact does not support a claim of `0` failures or `100%` success at this profile.

### `10000-rpm-full-results.json`

- Virtual users created: `50100`
- Virtual users completed: `2615`
- Virtual users failed: `47485`
- HTTP `200`: `8723`
- HTTP `429`: `47263`
- HTTP `500`: `1957`
- Overall mean response time: `165.6 ms`
- Overall p95 response time: `376.2 ms`
- Successful-request mean response time: `382.0 ms`
- Successful-request p95 response time: `572.6 ms`
- `/init` mean response time: `142.3 ms`
- `/process` mean response time: `412.6 ms`
- `/details` mean response time: `261.2 ms`

Interpretation:

- This run represents overload, not a usable operating point.
- The dominant failure mode was `/init` throttling.
- Additional HTTP `500` responses occurred later in the flow, especially around `/details`.
- The low overall latency is again skewed by fast failures.

## Cross-Run Findings

### 1. Request-level and flow-level outcomes diverge sharply

- The full-flow artifacts contain many HTTP `200` responses while still showing poor end-to-end completion rates.
- Any future summary should report both request success and virtual-user completion side by side.

### 2. `/init` is the main choke point in the saved runs

- The majority of HTTP `429` responses are recorded at `/init` in both full-flow artifacts and both init-only artifacts.
- This points to an upstream admission or throttling limit before most requests can proceed through the full workflow.

### 3. `/process` is the slowest successful step

- In both full-flow artifacts, `/process` has the highest mean successful response time among the payment-portal endpoints.
- That makes it the best first backend slice to inspect after `/init` throttling is understood.

### 4. The current saved artifacts do not establish a stable threshold

- The local artifact set does not support the claim that the system is stable at the lower profile.
- A fresh controlled ramp is still needed to determine where sustained degradation begins.

## Recommended Follow-Up

### Fresh comparable runs

Re-run and archive a comparable set with the current configs:

- `1000-rpm-init`
- `1000-rpm-full`
- `10000-rpm-init`
- `10000-rpm-full`

For each run, record:

- command used
- target URL
- commit SHA
- environment
- timestamp
- whether metrics are request-level or flow-level

### Narrow next experiments

- Run an incremental ramp between the two existing profiles.
- Confirm where `/init` throttling is enforced.
- Inspect `/process` for backend latency contributors once `/init` admission is understood.
- Consider adding isolated `/details` coverage if read-path scalability becomes a question.
