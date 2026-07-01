# PAY-329: Load Testing Findings For `20260701111948`

This document summarizes the two saved Artillery artifacts under `artillery/results/20260701111948/` and records what they show about this specific load-test run.

## Scope and Caveats

- The how-to guidance for running Artillery lives in `artillery/README.md`.
- The saved result files are the source of truth for the numbers below.
- This report covers only these two artifacts:
  - `artillery/results/20260701111948/10000ramp-rpm-init-results.json`
  - `artillery/results/20260701111948/10000ramp-rpm-full-results.json`
- The current checked-in environment files are:
  - `artillery/environments/1000-rpm.yml`: `17` arrivals/sec for `300` seconds, `maxVusers: 500`
  - `artillery/environments/10000-rpm.yml`: `167` arrivals/sec for `180` seconds, `maxVusers: 2000`
- These requested artifacts do not match the current checked-in `10000-rpm.yml` profile shape. Each artifact created `149700` virtual users, which is far above the about `30060` users implied by the current `167 arrivals/sec for 180s` config.
- Request-level success and flow-level success are different metrics and need to be interpreted separately.
- Both artifacts report `null` for the aggregate HTTP mean field, so the discussion below relies on counters, medians, p95s, and the successful-request mean where available.

## Saved Result Set

| Artifact                                                           | Scenario    | Notes                                                                                 |
| ------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------- |
| `artillery/results/20260701111948/10000ramp-rpm-init-results.json` | `init-only` | Does not match the current checked-in `10000-rpm.yml` profile; created `149700` users |
| `artillery/results/20260701111948/10000ramp-rpm-full-results.json` | `full-flow` | Does not match the current checked-in `10000-rpm.yml` profile; created `149700` users |

## Results Summary

### `10000ramp-rpm-init-results.json`

- Virtual users created: `149700`
- Virtual users completed: `107`
- Virtual users failed: `149593`
- Completion rate: `0.1%`
- Failure rate: `99.9%`
- HTTP `200`: `107`
- HTTP `429`: `91147`
- HTTP `500`: `47534`
- HTTP `502`: `10912`
- Recorded `errors.Failed capture or match`: `149593`
- Overall mean response time: `null` in the saved artifact
- Overall p50 response time: `6.0 ms`
- Overall p95 response time: `27181.5 ms`
- Successful-request mean response time: `15492.3 ms`
- Successful-request p95 response time: `26115.6 ms`
- `/init` mean response time: `null` in the saved artifact

Interpretation:

- This run represents extreme overload, not a usable operating point.
- The dominant response classes are HTTP `429`, `500`, and `502`, not non-HTTP `EMFILE` or `ERR_SOCKET_TIMEOUT` failures.
- The very low aggregate p50 is misleading because fast failures dominate the sample.
- The small number of successful `200` responses were very slow, with a successful-request mean above `15` seconds.

### `10000ramp-rpm-full-results.json`

- Virtual users created: `149700`
- Virtual users completed: `285`
- Virtual users failed: `149415`
- Completion rate: `0.2%`
- Failure rate: `99.8%`
- HTTP `200`: `666`
- HTTP `429`: `89243`
- HTTP `500`: `48858`
- HTTP `502`: `11788`
- Recorded `errors.Failed capture or match`: `149415`
- Overall mean response time: `null` in the saved artifact
- Overall p50 response time: `6.0 ms`
- Overall p95 response time: `27181.5 ms`
- Successful-request mean response time: `6980.9 ms`
- Successful-request p95 response time: `25091.6 ms`
- `/init` mean response time: `null` in the saved artifact
- `/process` mean response time: `13468.0 ms`
- `/details` mean response time: `8083.5 ms`

Interpretation:

- This run also represents extreme overload, not a usable operating point.
- The dominant failure pattern is again HTTP `429`, `500`, and `502`, with `errors.Failed capture or match` following from those failed steps.
- The full-flow run produced only `285` completed virtual users out of `149700` created.
- When full-flow requests did succeed, `/process` was the slowest successful payment-portal step by a wide margin.

## Cross-Run Findings

### 1. These artifacts do not line up with the current checked-in `10000-rpm.yml`

- The current checked-in `10000-rpm.yml` profile is `167 arrivals/sec for 180s` with `maxVusers: 2000`.
- Each requested artifact created `149700` virtual users, so these runs came from a materially different shape than the current checked-in profile.

### 2. Both runs are dominated by HTTP failures, not `EMFILE`

- Neither requested artifact records `errors.EMFILE`.
- Both artifacts are instead dominated by HTTP `429`, `500`, and `502` responses.
- That makes these runs materially different from the earlier `EMFILE`-heavy stress artifacts.

### 3. Request-level and flow-level outcomes diverge sharply

- The `init-only` artifact contains `107` HTTP `200` responses while only `107` virtual users complete, because each scenario issues a single request.
- The `full-flow` artifact contains `666` HTTP `200` responses while only `285` virtual users complete the full scenario.
- Any summary of these runs should report both request success and virtual-user completion side by side.

### 4. The full-flow path is worse than the init-only path

- `init-only` completes only `0.1%` of virtual users.
- `full-flow` completes only `0.2%` of virtual users, but it also shows very high successful latencies in the later app steps.
- In the full-flow run, `/process` is the slowest successful payment-portal step at `13468.0 ms` mean.

### 5. Aggregate latency percentiles are skewed by fast failures

- Both artifacts show an overall p50 of `6.0 ms`.
- That does not indicate healthy performance; it reflects a very large number of fast failing requests.
- The successful-request latency metrics provide a better view of the small fraction of requests that actually completed.

## Recommended Follow-Up

### Immediate comparisons

1. Compare these artifacts against the exact command and config that produced them, because they do not match the current checked-in `10000-rpm.yml` shape.
2. Confirm whether these `10000ramp` runs came from a separate ramp configuration that is not currently checked in.
3. Keep these findings separate from the earlier `EMFILE`-heavy stress results, because the failure modes are different.

### Narrow next experiments

1. Re-run the current checked-in `10000-rpm.yml` profile separately so its results are not mixed with this `10000ramp` run shape.
2. Compare app logs for the `429`, `500`, and `502` windows to determine whether request rejection, downstream failure, or internal server failure is dominant.
3. Inspect `/process` first in the full-flow path, since it is the slowest successful payment-portal step in these artifacts.
