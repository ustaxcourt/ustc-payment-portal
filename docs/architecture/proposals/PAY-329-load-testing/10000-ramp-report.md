# PAY-329: Load Testing Findings For `20260701121320`

This document summarizes the two saved Artillery artifacts under `artillery/results/20260701121320/` and records what they show about this specific load-test run.

## Scope and Caveats

- The how-to guidance for running Artillery lives in `artillery/README.md`.
- The saved result files are the source of truth for the numbers below.
- This report covers only these two artifacts:
  - `artillery/results/20260701121320/10000ramp-rpm-init-results.json`
  - `artillery/results/20260701121320/10000ramp-rpm-full-results.json`
- The current checked-in environment files are:
  - `artillery/environments/1000-rpm.yml`: `17` arrivals/sec for `300` seconds, `maxVusers: 500`
  - `artillery/environments/10000-rpm.yml`: `167` arrivals/sec for `180` seconds, `maxVusers: 2000`
- These requested artifacts do not match the current checked-in `10000-rpm.yml` profile shape. Each artifact created `149700` virtual users, which is far above the about `30060` users implied by the current `167 arrivals/sec for 180s` config.
- Request-level success and flow-level success are different metrics and need to be interpreted separately.
- Both artifacts report `null` for the aggregate HTTP mean field, so the discussion below relies on counters, medians, p95s, and the successful-request mean where available.
- The minute-by-minute ramp tables below are rolled up from the saved `intermediate` snapshots. Because failures and completions can land in a later minute than the virtual user was created, per-minute failure rates can exceed `100%` and should be read as overlap across minute boundaries, not as a math error.

## Saved Result Set

| Artifact                                                           | Scenario    | Notes                                                                                 |
| ------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------- |
| `artillery/results/20260701121320/10000ramp-rpm-init-results.json` | `init-only` | Does not match the current checked-in `10000-rpm.yml` profile; created `149700` users |
| `artillery/results/20260701121320/10000ramp-rpm-full-results.json` | `full-flow` | Does not match the current checked-in `10000-rpm.yml` profile; created `149700` users |

## Results Summary

### `10000ramp-rpm-init-results.json`

- Virtual users created: `149700`
- Virtual users completed: `87`
- Virtual users failed: `149613`
- Completion rate: `0.1%`
- Failure rate: `99.9%`
- HTTP `200`: `87`
- HTTP `429`: `91248`
- HTTP `500`: `47436`
- HTTP `502`: `10929`
- Recorded `errors.Failed capture or match`: `149613`
- Overall mean response time: `null` in the saved artifact
- Overall p50 response time: `6.0 ms`
- Overall p95 response time: `27181.5 ms`
- Successful-request mean response time: `16355.7 ms`
- Successful-request p95 response time: `24594.7 ms`
- `/init` mean response time: `null` in the saved artifact

Interpretation:

- This run represents extreme overload, not a usable operating point.
- The dominant response classes are HTTP `429`, `500`, and `502`, not non-HTTP `EMFILE` or `ERR_SOCKET_TIMEOUT` failures.
- The very low aggregate p50 is misleading because fast failures dominate the sample.
- The small number of successful `200` responses were very slow, with a successful-request mean above `16` seconds.

Minute-by-minute ramp results:

| Minute | Avg req/s | VUs created | VUs completed | VUs failed | HTTP 200 | HTTP 429 | HTTP 500 | HTTP 502 |
| ------ | --------- | ----------- | ------------- | ---------- | -------- | -------- | -------- | -------- |
| 1      | `166.3`   | `8632`      | `31`          | `7602`     | `31`     | `0`      | `6608`   | `994`    |
| 2      | `309.0`   | `18534`     | `0`           | `18712`    | `0`      | `6434`   | `9804`   | `2474`   |
| 3      | `478.5`   | `28697`     | `0`           | `28518`    | `0`      | `16505`  | `9533`   | `2481`   |
| 4      | `644.0`   | `38634`     | `0`           | `38636`    | `0`      | `26673`  | `9968`   | `1994`   |
| 5      | `813.7`   | `48799`     | `0`           | `48797`    | `0`      | `36704`  | `10094`  | `1999`   |
| 6      | `278.3`   | `6404`      | `56`          | `7348`     | `56`     | `4932`   | `1429`   | `987`    |

### `10000ramp-rpm-full-results.json`

- Virtual users created: `149700`
- Virtual users completed: `38`
- Virtual users failed: `149662`
- Completion rate: `0.03%`
- Failure rate: `99.97%`
- HTTP `200`: `100`
- HTTP `429`: `91321`
- HTTP `500`: `47452`
- HTTP `502`: `10941`
- Recorded `errors.Failed capture or match`: `149662`
- Overall mean response time: `null` in the saved artifact
- Overall p50 response time: `6.0 ms`
- Overall p95 response time: `27181.5 ms`
- Successful-request mean response time: `5682.7 ms`
- Successful-request p95 response time: `18588.1 ms`
- `/init` mean response time: `null` in the saved artifact
- `/process` mean response time: `1210.6 ms`
- `/details` mean response time: `1806.9 ms`

Interpretation:

- This run also represents extreme overload, not a usable operating point.
- The dominant failure pattern is again HTTP `429`, `500`, and `502`, with `errors.Failed capture or match` following from those failed steps.
- The full-flow run produced only `38` completed virtual users out of `149700` created.
- Successful requests were still slow, but materially less slow than the earlier `20260701111948` full-flow artifact.

Minute-by-minute ramp results:

| Minute | Avg req/s | VUs created | VUs completed | VUs failed | HTTP 200 | HTTP 429 | HTTP 500 | HTTP 502 |
| ------ | --------- | ----------- | ------------- | ---------- | -------- | -------- | -------- | -------- |
| 1      | `166.2`   | `8877`      | `25`          | `7857`     | `52`     | `0`      | `6914`   | `994`    |
| 2      | `313.2`   | `18782`     | `1`           | `18781`    | `0`      | `6521`   | `9550`   | `2712`   |
| 3      | `483.0`   | `28952`     | `0`           | `28945`    | `0`      | `17030`  | `9661`   | `2253`   |
| 4      | `648.2`   | `38881`     | `0`           | `38882`    | `0`      | `26740`  | `10146`  | `1997`   |
| 5      | `817.8`   | `49050`     | `0`           | `49047`    | `0`      | `37228`  | `9829`   | `1990`   |
| 6      | `210.0`   | `5158`      | `12`          | `6150`     | `48`     | `3802`   | `1352`   | `995`    |

## Cross-Run Findings

### 1. These artifacts do not line up with the current checked-in `10000-rpm.yml`

- The current checked-in `10000-rpm.yml` profile is `167 arrivals/sec for 180s` with `maxVusers: 2000`.
- Each requested artifact created `149700` virtual users, so these runs came from a materially different shape than the current checked-in profile.

### 2. Both runs are dominated by HTTP failures, not `EMFILE`

- Neither requested artifact records `errors.EMFILE`.
- Both artifacts are instead dominated by HTTP `429`, `500`, and `502` responses.
- That makes these runs materially different from the earlier `EMFILE`-heavy stress artifacts.

### 3. Request-level and flow-level outcomes diverge sharply

- The `init-only` artifact contains `87` HTTP `200` responses while only `87` virtual users complete, because each scenario issues a single request.
- The `full-flow` artifact contains `100` HTTP `200` responses while only `38` virtual users complete the full scenario.
- Any summary of these runs should report both request success and virtual-user completion side by side.

### 4. The full-flow path is worse than the init-only path

- `init-only` completes only `0.1%` of virtual users.
- `full-flow` completes only `0.03%` of virtual users.
- The biggest degradation for both scenarios appears after minute 1, when `429`, `500`, and `502` responses rise sharply as the ramp increases.
- In the successful full-flow subset, `/details` is now slower than `/process`, but the sample size is extremely small.

### 5. Aggregate latency percentiles are skewed by fast failures

- Both artifacts show an overall p50 of `6.0 ms`.
- That does not indicate healthy performance; it reflects a very large number of fast failing requests.
- The successful-request latency metrics provide a better view of the small fraction of requests that actually completed.

### 6. The minute tables show the failure mode changes as the ramp increases

- Minute 1 is the only window where either scenario records a noticeable number of successful completions.
- From minute 2 through minute 5, both scenarios effectively collapse into a mix of `429`, `500`, and `502` responses while completions fall to near zero.
- Minute 6 contains a reduced arrival window plus trailing completions and failures from earlier requests, so it should not be read as recovery.

## Recommended Follow-Up

### Immediate comparisons

1. Compare these artifacts against the exact command and config that produced them, because they do not match the current checked-in `10000-rpm.yml` shape.
2. Confirm whether these `10000ramp` runs came from a separate ramp configuration that is not currently checked in.
3. Keep these findings separate from the earlier `EMFILE`-heavy stress results, because the failure modes are different.

### Narrow next experiments

1. Re-run the current checked-in `10000-rpm.yml` profile separately so its results are not mixed with this `10000ramp` run shape.
2. Compare app logs for the minute 2 to minute 5 `429`, `500`, and `502` windows to determine whether request rejection, downstream failure, or internal server failure is dominant.
3. Inspect why the full-flow run dropped from `100` successful HTTP `200` responses to only `38` fully completed virtual users.
