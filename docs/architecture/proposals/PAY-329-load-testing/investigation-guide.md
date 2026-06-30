# PAY-329: Investigation Guide

This guide is a step-by-step checklist for narrowing down the current load-test failure modes before changing pool settings, concurrency limits, or other capacity knobs.

## Goal

Determine which layer is actually failing first:

- Artillery Lambda worker
- payment portal Lambda runtime
- outbound Pay.gov path
- database or RDS Proxy path

Do not treat `EMFILE` or `ERR_SOCKET_TIMEOUT` as a database bottleneck until the source is isolated.

## 1. Start With Run Metadata

For every run you inspect or re-run, capture these details first:

1. Scenario file used.
2. Environment profile used.
3. Target identifier.
4. Commit SHA.
5. Environment name.
6. Timestamp range.
7. Whether the run used the Lambda wrapper in `scripts/run-artillery-lambda.js`.
8. Output artifact path under `artillery/results/`.

Use this format in your notes:

```text
run_name:
scenario:
profile:
target:
commit_sha:
environment:
start_time_utc:
end_time_utc:
artifact:
lambda_wrapper: yes|no
```

## 2. Establish The Current Baseline

Confirm the current artifact story before looking at logs:

1. `1000-rpm-init` is the clean lower-profile run.
2. `1000-rpm-full` now fails with `ERR_SOCKET_TIMEOUT`.
3. `10000-rpm-init` fails mostly with `EMFILE`, plus a small number of `500` and `502` responses.
4. `10000-rpm-full` fails mostly with `EMFILE` across multiple steps.

If the artifacts change again, update the baseline first before drawing conclusions.

## 3. Find Where `EMFILE` Is Originating

Check logs for the exact timestamp range of the stress-profile run.

### Payment portal Lambda logs

1. Search application logs for `EMFILE`.
2. Search for socket-open failures, connection-open failures, or similar low-level runtime errors.
3. Search for request timeout or downstream timeout messages around `/init`, `/process`, and `/details`.

Interpretation:

- If app logs contain `EMFILE`, the app runtime or one of its clients is exhausting file descriptors or sockets.
- If app logs do not contain `EMFILE`, the error is more likely on the load-generator side.

### Artillery Lambda worker logs

1. Search worker logs for `EMFILE`.
2. Search for socket exhaustion, open handle exhaustion, or HTTP client creation failures.
3. Note whether failures happen before any application HTTP response is received.

Interpretation:

- If worker logs contain `EMFILE`, investigate the Artillery execution environment before tuning the payment service.

## 4. Separate The Failure Modes

Treat the two current non-HTTP failure modes separately:

### `ERR_SOCKET_TIMEOUT`

This means a socket was established but the request did not complete before timeout.

Current evidence:

- `1000-rpm-full` shows `ERR_SOCKET_TIMEOUT`.
- The simulated Pay.gov step stays relatively fast while app endpoints become slow.

Primary suspects:

- app-side latency
- outbound dependency latency inside the app
- slow downstream persistence or state transitions

### `EMFILE`

This means the process could not open another file descriptor or socket.

Current evidence:

- `10000-rpm-init` and `10000-rpm-full` show `EMFILE`.
- `10000-rpm-full` records `EMFILE` across `/init`, `/process`, `/details`, and the simulated Pay.gov step.

Primary suspects:

- Artillery Lambda worker FD exhaustion
- application runtime socket or handle exhaustion
- less likely: a pure database bottleneck by itself

## 5. Run A Small Matrix Tomorrow

Re-run these in order and keep notes for each:

1. `1000-rpm-init`
2. `1000-rpm-full`
3. one intermediate profile between `1000-rpm` and `10000-rpm`
4. `10000-rpm-init`
5. `10000-rpm-full`

The purpose is to find the first profile where each failure mode appears.

Questions to answer:

1. At what arrival rate does `ERR_SOCKET_TIMEOUT` first appear?
2. At what arrival rate does `EMFILE` first appear?
3. Does `EMFILE` appear in `init-only` before it appears in `full-flow`?
4. Does `full-flow` degrade sharply even when `init-only` is still acceptable?

## 6. Compare `init-only` And `full-flow`

Use the scenario difference to narrow the bottleneck.

### If `init-only` fails badly

Investigate:

1. request admission into the app
2. `initPayment` latency
3. fee lookup and transaction insert path
4. outbound `startOnlineCollection` Pay.gov call

### If `full-flow` fails much worse than `init-only`

Investigate:

1. `processPayment`
2. `getDetails`
3. follow-up DB writes and reads
4. outbound `completeOnlineCollectionWithDetails` call

## 7. Capture The Right Metrics

For every re-run, collect these system metrics for the same time window.

### Lambda app metrics

1. concurrent executions
2. duration
3. p95 and p99 duration
4. errors
5. throttles
6. timeouts

### Database or RDS Proxy metrics

1. active connections
2. borrow latency or connection wait time
3. CPU utilization
4. saturation or queueing metrics

### Worker-side observations

1. Artillery worker runtime errors
2. any `EMFILE` stack traces
3. any evidence of socket-open failure

## 8. Instrument The App Before Tuning

Add step-level timing around the main payment-flow operations.

### In `initPayment`

Capture time spent in:

1. fee lookup
2. in-flight transaction lookup
3. transaction insert
4. outbound Pay.gov `startOnlineCollection`
5. transaction update to initiated

### In `processPayment`

Capture time spent in:

1. token lookup
2. sibling lookup
3. fee lookup
4. outbound Pay.gov `completeOnlineCollectionWithDetails`
5. persistence update after Pay.gov
6. final readback of all rows

### In `getDetails`

Capture time spent in:

1. row lookup by reference id
2. fee lookup
3. outbound Pay.gov refresh
4. persistence update after refresh

Keep DB timing separate from outbound Pay.gov timing.

## 9. Use These Decision Rules

### If only worker logs show `EMFILE`

Conclusion:

- the load generator or worker runtime is the first bottleneck

Action:

- investigate Artillery worker environment limits before changing app internals

### If app logs show `EMFILE`

Conclusion:

- the Lambda runtime or one of its clients is exhausting sockets or handles

Action:

- inspect HTTP client usage, open handles, and downstream connection behavior

### If app duration is high and DB wait metrics are high

Conclusion:

- the DB path becomes a stronger suspect

Action:

- investigate query latency, proxy wait, and connection pressure before changing pool size

### If Pay.gov call timing dominates and DB timing stays low

Conclusion:

- outbound dependency latency is more likely than DB pool exhaustion

Action:

- inspect outbound request concurrency, timeouts, and downstream behavior

## 10. Do Not Start With Pool Changes

Do not begin tomorrow by increasing the Knex pool in `src/db/knex.ts`.

Reason:

1. the Lambda path intentionally uses `pool: { min: 0, max: 1 }`
2. the current artifacts do not isolate DB checkout pressure as the first failure
3. changing the pool before attribution will blur the signal

Treat pool changes as follow-up experiments only after the logs and metrics show the DB path is on the critical path.

## 11. End-Of-Day Deliverable

By the end of tomorrow, aim to answer these four questions:

1. Does `EMFILE` originate in the Artillery worker, the app runtime, or both?
2. Does `1000-rpm-full` fail because of slow app-path latency, outbound dependency latency, or database pressure?
3. At what profile does each failure mode first appear?
4. What is the next single targeted experiment after attribution?
