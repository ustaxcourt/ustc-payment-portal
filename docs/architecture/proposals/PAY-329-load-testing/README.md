# PAY-329: Load Testing Findings

This document summarizes Artillery result artifacts collected during the load-test spike and records what they show about the current findings.

## Scope and Caveats

- The how-to guidance for running Artillery lives in `artillery/README.md`.
- The raw Artillery JSON outputs are the source of truth for the numbers below.
- Those raw outputs were generated locally under `artillery/results/`, which is ignored and not committed to the repository.
- The `1000-rpm` and `10000-rpm` profile names describe approximate flow starts per minute, not literal HTTP requests per minute.
- All four saved artifacts align with the current 300-second environment files.
- The `10000-rpm` artifacts create `50101` virtual users rather than exactly `50100`; treat that as effectively matching the current `167 arrivals/sec for 300s` profile.
- Request-level success and flow-level success are different metrics and need to be interpreted separately.
- The saved `10000-rpm-full` artifact reports `null` for the aggregate HTTP mean fields, so the stress-profile discussion below relies on medians, p95s, per-endpoint means, and counters instead.

## Saved Result Set

| Artifact name                 | Scenario    | Notes                                                           |
| ----------------------------- | ----------- | --------------------------------------------------------------- |
| `1000-rpm-init-results.json`  | `init-only` | Matches current `17 arrivals/sec for 300s` profile              |
| `1000-rpm-full-results.json`  | `full-flow` | Matches current `17 arrivals/sec for 300s` profile              |
| `10000-rpm-init-results.json` | `init-only` | Effectively matches current `167 arrivals/sec for 300s` profile |
| `10000-rpm-full-results.json` | `full-flow` | Effectively matches current `167 arrivals/sec for 300s` profile |

## Results Summary

### `1000-rpm-init-results.json`

- Virtual users created: `5100`
- Virtual users completed: `5100`
- Virtual users failed: `0`
- HTTP `200`: `5100`
- HTTP `500`: `0`
- HTTP `502`: `0`
- Overall mean response time: `335.1 ms`
- Overall p95 response time: `596.0 ms`
- Successful-request mean response time: `335.1 ms`

Interpretation:

- This saved artifact is a clean 5-minute `init-only` baseline run.
- At the lower profile, `/init` completed successfully for every virtual user.

### `10000-rpm-init-results.json`

- Virtual users created: `50101`
- Virtual users completed: `27524`
- Virtual users failed: `22577`
- Completion rate: `54.9%`
- Failure rate: `45.1%`
- HTTP `200`: `27524`
- HTTP `500`: `18`
- HTTP `502`: `517`
- Recorded `errors.EMFILE`: `22042`
- Recorded `errors.Failed capture or match`: `535`
- Overall mean response time: `10453.0 ms`
- Overall p95 response time: `24594.7 ms`
- Successful-request mean response time: `10148.5 ms`
- Successful-request p95 response time: `23630.3 ms`

Interpretation:

- This saved artifact is not shortened; it is a stress-profile run over the current 5-minute shape.
- The dominant recorded failure mode is non-HTTP `EMFILE`, not `429` throttling.
- Even successful `/init` requests became very slow under this profile, with p95 latency above `24` seconds.

### `1000-rpm-full-results.json`

- Virtual users created: `5100`
- Virtual users completed: `3857`
- Virtual users failed: `1243`
- Completion rate: `75.6%`
- Failure rate: `24.4%`
- HTTP `200`: `17089`
- HTTP `500`: `0`
- HTTP `502`: `0`
- Recorded `errors.ERR_SOCKET_TIMEOUT`: `1243`
- `ERR_SOCKET_TIMEOUT` by step: `/init` `557`, `/process` `397`, `/details` `289`
- Overall mean response time: `5751.1 ms`
- Overall p95 response time: `11050.8 ms`
- Successful-request mean response time: `5751.1 ms`
- Successful-request p95 response time: `11050.8 ms`
- `/init` mean response time: `8664.1 ms`
- `/process` mean response time: `9061.8 ms`
- `/details` mean response time: `5411.8 ms`

Interpretation:

- This saved artifact no longer shows a stable lower-profile full-flow run.
- The dominant recorded failure mode is `ERR_SOCKET_TIMEOUT`, not HTTP `429`, `500`, or `502`.
- `/process` is still the slowest successful payment-portal step, but `/init` is close behind and both are now measured in seconds rather than milliseconds.

### `10000-rpm-full-results.json`

- Virtual users created: `50101`
- Virtual users completed: `4182`
- Virtual users failed: `45919`
- Completion rate: `8.3%`
- Failure rate: `91.7%`
- HTTP `200`: `60216`
- HTTP `500`: `0`
- HTTP `502`: `0`
- Recorded `errors.EMFILE`: `45919`
- `EMFILE` by step: `/init` `23823`, simulated pay step `5591`, `/process` `11618`, `/details` `4887`
- Overall mean response time: `null` in the saved artifact
- Overall p50 response time: `6976.1 ms`
- Overall p95 response time: `10617.5 ms`
- `/init` mean response time: `7343.1 ms`
- `/process` mean response time: `10192.2 ms`
- `/details` mean response time: `6054.5 ms`

Interpretation:

- This run represents overload, not a usable operating point.
- The saved artifact shows no HTTP `429`, `500`, or `502` responses in the full-flow stress run.
- Instead, failures are recorded as non-HTTP `EMFILE` errors across every stage of the flow.
- When requests do succeed, latencies are still very high, and `/process` remains the slowest payment-portal step.

## Cross-Run Findings

### 1. All four saved artifacts now match the current profile shapes

- The saved `1000-rpm` artifacts each create `5100` virtual users, matching `17 arrivals/sec for 300s`.
- The saved `10000-rpm` artifacts each create `50101` virtual users, which is effectively the current `167 arrivals/sec for 300s` shape.

### 2. Only the lower-profile `init-only` run is clean in the current artifact set

- `1000-rpm-init` still shows `100%` completion and no recorded failures.
- `1000-rpm-full` now completes only `75.6%` of virtual users and records `1243` `ERR_SOCKET_TIMEOUT` failures.

### 3. The current artifact set shows two different non-HTTP failure modes

- The saved `1000-rpm-full` artifact records `1243` `ERR_SOCKET_TIMEOUT` failures.
- The saved `10000-rpm-init` artifact records `22042` `EMFILE` errors, plus a smaller number of HTTP `502` and `500` responses.
- The saved `10000-rpm-full` artifact records `45919` `EMFILE` errors and no HTTP `429`, `500`, or `502` responses.
- Any follow-up should treat these as different failure modes from simple API throttling.

### 4. Request-level and flow-level outcomes diverge at both profiles

- The `1000-rpm-full` artifact contains `17089` HTTP `200` responses while only `3857` virtual users complete the full scenario.
- The `10000-rpm-full` artifact contains `60216` HTTP `200` responses while only `4182` virtual users complete the full scenario.
- Future summaries should continue to report both request success and virtual-user completion side by side.

### 5. `/process` is the slowest successful payment-portal step in full-flow runs

- At `1000-rpm-full`, `/process` has the highest mean response time among the payment-portal endpoints.
- At `10000-rpm-full`, `/process` is still the slowest successful payment-portal step, and its mean response time rises above `10` seconds.

## Recommended Follow-Up

For a step-by-step investigation plan, see [investigation-guide.md](./investigation-guide.md).

### Fresh comparable runs

Re-run and archive a comparable set with the current configs:

- `1000-rpm-init`
- `1000-rpm-full`
- `10000-rpm-init`
- `10000-rpm-full`

For each run, record:

- command used
- target identifier
- commit SHA
- environment
- timestamp
- whether metrics are request-level or flow-level

### Narrow next experiments

- Run an incremental ramp between the two existing profiles.
- Determine why the updated `1000-rpm-full` artifact is now timing out before treating the lower profile as a stable baseline.
- Determine where the recorded `EMFILE` errors originate before treating the stress-profile results as pure service saturation.
- Inspect `/process` for backend latency contributors once the stress-profile execution failure mode is understood.
- Consider adding isolated `/details` coverage if read-path scalability becomes a question.
