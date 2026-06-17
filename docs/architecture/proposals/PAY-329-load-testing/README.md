# PAY-329: Load Testing Spike

## Summary

This spike defines a repeatable load-testing approach for the USTC Payment Portal using Artillery against the `POST /payments` API. The purpose is not to validate expected production traffic, which is low, but to identify the system's practical limits and the first point of meaningful degradation under stress, with a particular focus on database saturation and connection management.

### Placeholder Results Summary

| Metric                                           | Placeholder                                                                                          |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Sustained throughput before material degradation | `[TBD]` requests/second                                                                              |
| First observed degradation point                 | `[TBD]` requests/minute or `[TBD]` requests/second                                                   |
| Primary bottleneck                               | `[TBD: database CPU / connection pool exhaustion / application CPU / downstream dependency / other]` |
| Secondary bottleneck                             | `[TBD]`                                                                                              |
| Recommended safe upper bound                     | `[TBD]` requests/second                                                                              |

## Objective

The objective of this spike is to stress the payment API well beyond expected real-world volume and answer the following questions:

- At what request rate does the system begin to show measurable latency or error-rate degradation?
- Is the first limiting factor the Node.js application tier, the database tier, or external dependency behavior?
- Does database connection pooling become a constraint before compute saturation?
- Can the service maintain stable behavior under short-duration burst traffic that far exceeds business expectations?
- What operational metrics should be monitored if similar stress tests are repeated in lower or production-like environments?

Expected real traffic is approximately 30 to 80 requests per day, so this exercise is intentionally a stress test rather than a capacity plan for ordinary business load.

## Test Environment

| Component           | Local Test Option                              | AWS / Distributed Test Option                         | Notes                                                                                 |
| ------------------- | ---------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Load generator      | Artillery CLI on developer machine             | Artillery distributed via AWS Lambda                  | Use Lambda mode when a single host cannot generate enough concurrent traffic reliably |
| API target          | Local dev server or deployed non-prod endpoint | Deployed non-prod endpoint                            | Prefer a stable, isolated environment for comparable runs                             |
| Endpoint under test | `POST /payments`                               | `POST /payments`                                      | JSON payload should represent a realistic payment initiation request                  |
| Application runtime | Node.js service in local stack                 | Lambda/API Gateway stack or equivalent hosted service | Capture runtime limits and concurrency behavior                                       |
| Database            | Local Postgres container or shared non-prod DB | Non-prod RDS/Postgres instance                        | Database telemetry is required for useful conclusions                                 |
| Metrics sink        | Console output, local logs, Docker stats       | CloudWatch, RDS metrics, Artillery reports            | CloudWatch or similar monitoring is strongly recommended                              |
| Test isolation      | Moderate                                       | High                                                  | Avoid running alongside unrelated high-traffic test activity                          |

## Load Test Scenarios

### Scenario 1: 1,000 Requests Per Minute

- Target rate: 1,000 requests/minute
- Approximate throughput: 16.7 requests/second
- Duration: 5 minutes
- Goal: establish a low-stress baseline for latency, throughput, and database behavior
- Expected outcome: no significant error rate and limited latency growth

### Scenario 2: 10,000 Requests Per Minute

- Target rate: 10,000 requests/minute
- Approximate throughput: 166.7 requests/second
- Duration: 5 minutes
- Goal: push the service into a stress range likely to expose pool exhaustion, lock contention, query slowdown, or runtime throttling
- Expected outcome: observable degradation in at least one tier, even if the API remains partially available

### Scenario 3: Ramp-Up Test

- Traffic pattern: gradual increase from low to high request rate
- Duration: variable, typically 10 to 20 minutes
- Goal: identify the exact range where latency, queueing, or errors begin to inflect
- Expected outcome: a clearer failure threshold than a fixed-rate blast test

A ramp test is especially important because it helps distinguish between:

- a system that fails abruptly at a hard limit
- a system that degrades gradually because of queuing or contention
- a system that recovers poorly once connection pools or worker concurrency are saturated

## Artillery Configuration Examples

The following examples assume a REST endpoint at `POST /payments` with a JSON payload. Replace placeholder values such as hostname, headers, and payload fields with environment-specific values before execution.

### 1,000 RPM Configuration (~17 RPS)

```yaml
config:
  target: "https://example-payment-api"
  phases:
    - duration: 300
      arrivalRate: 17
      name: baseline-1000-rpm
  defaults:
    headers:
      Content-Type: "application/json"
      Accept: "application/json"
  processor: "./artillery-hooks.js"

scenarios:
  - name: create-payment-1000-rpm
    flow:
      - post:
          url: "/payments"
          json:
            clientId: "load-test-client"
            caseNumber: "2026-0001"
            amount: 125.00
            currency: "USD"
            payer:
              firstName: "Test"
              lastName: "User"
              email: "loadtest@example.com"
            source: "artillery-spike"
```

### 10,000 RPM Configuration (~167 RPS)

```yaml
config:
  target: "https://example-payment-api"
  phases:
    - duration: 300
      arrivalRate: 167
      name: stress-10000-rpm
  defaults:
    headers:
      Content-Type: "application/json"
      Accept: "application/json"
  processor: "./artillery-hooks.js"

scenarios:
  - name: create-payment-10000-rpm
    flow:
      - post:
          url: "/payments"
          json:
            clientId: "load-test-client"
            caseNumber: "2026-0001"
            amount: 125.00
            currency: "USD"
            payer:
              firstName: "Test"
              lastName: "User"
              email: "loadtest@example.com"
            source: "artillery-spike"
```

### Ramp Scenario Configuration

```yaml
config:
  target: "https://example-payment-api"
  phases:
    - duration: 120
      arrivalRate: 10
      name: warm-up
    - duration: 120
      arrivalRate: 25
      name: ramp-1
    - duration: 120
      arrivalRate: 50
      name: ramp-2
    - duration: 120
      arrivalRate: 100
      name: ramp-3
    - duration: 120
      arrivalRate: 150
      name: ramp-4
    - duration: 120
      arrivalRate: 200
      name: ramp-5
  defaults:
    headers:
      Content-Type: "application/json"
      Accept: "application/json"
  processor: "./artillery-hooks.js"

scenarios:
  - name: create-payment-ramp
    flow:
      - post:
          url: "/payments"
          json:
            clientId: "load-test-client"
            caseNumber: "2026-0001"
            amount: 125.00
            currency: "USD"
            payer:
              firstName: "Test"
              lastName: "User"
              email: "loadtest@example.com"
            source: "artillery-spike"
```

## Execution Notes

- Run locally when validating the mechanics of the scenario, request payloads, and instrumentation.
- Use Artillery's AWS Lambda or other distributed mode when the load generator itself becomes the bottleneck.
- Keep payloads realistic enough to exercise serialization, validation, persistence, and downstream logic.
- Record the exact application build, infrastructure version, database instance class, and configuration values used for each run.
- Separate warm-up runs from measured runs so JIT startup, cold caches, and connection establishment do not distort the main results.

## Metrics to Capture

### Application-Level Metrics

- Throughput in requests/second and requests/minute
- Latency percentiles: p50, p95, and p99
- Error rate by HTTP status code and exception category
- Request timeout count
- Lambda duration and concurrency, if applicable
- API Gateway 4xx and 5xx rates, if applicable

### Database Metrics

- Database CPU utilization
- Active and idle connection counts
- Connection pool wait time, if available from application telemetry
- Slow query count and slow query duration
- Average query latency for inserts, updates, and lookup queries used by payment flow
- Disk IOPS and storage throughput if the environment is hosted on RDS or similar
- Lock waits or contention indicators

### Observability Notes

- Prefer CloudWatch, RDS Performance Insights, or equivalent monitoring to correlate API degradation with database behavior.
- If running locally, capture container resource usage and Postgres statistics where possible.
- Timestamp test start and end precisely so infrastructure graphs can be aligned with each scenario.

## Results

### Scenario Summary

| Scenario   | Duration | Target Rate   | Achieved Throughput | p50 Latency | p95 Latency | p99 Latency | Error Rate | Notes   |
| ---------- | -------- | ------------- | ------------------- | ----------- | ----------- | ----------- | ---------- | ------- |
| 1,000 RPM  | 5 min    | 16.7 RPS      | `[TBD]`             | `[TBD]`     | `[TBD]`     | `[TBD]`     | `[TBD]`    | `[TBD]` |
| 10,000 RPM | 5 min    | 166.7 RPS     | `[TBD]`             | `[TBD]`     | `[TBD]`     | `[TBD]`     | `[TBD]`    | `[TBD]` |
| Ramp-up    | `[TBD]`  | 10 to 200 RPS | `[TBD]`             | `[TBD]`     | `[TBD]`     | `[TBD]`     | `[TBD]`    | `[TBD]` |

### Database Observations

| Scenario   | DB CPU  | Connections | Slow Queries | Lock / Wait Signals | Primary DB Observation |
| ---------- | ------- | ----------- | ------------ | ------------------- | ---------------------- |
| 1,000 RPM  | `[TBD]` | `[TBD]`     | `[TBD]`      | `[TBD]`             | `[TBD]`                |
| 10,000 RPM | `[TBD]` | `[TBD]`     | `[TBD]`      | `[TBD]`             | `[TBD]`                |
| Ramp-up    | `[TBD]` | `[TBD]`     | `[TBD]`      | `[TBD]`             | `[TBD]`                |

### Error Breakdown

| Scenario   | 4xx Rate | 5xx Rate | Timeouts | Retries | Dominant Failure Mode |
| ---------- | -------- | -------- | -------- | ------- | --------------------- |
| 1,000 RPM  | `[TBD]`  | `[TBD]`  | `[TBD]`  | `[TBD]` | `[TBD]`               |
| 10,000 RPM | `[TBD]`  | `[TBD]`  | `[TBD]`  | `[TBD]` | `[TBD]`               |
| Ramp-up    | `[TBD]`  | `[TBD]`  | `[TBD]`  | `[TBD]` | `[TBD]`               |

## Failure Threshold Analysis

The goal of the failure-threshold analysis is to identify the first rate at which the system ceases to behave acceptably, even if it has not fully failed. For this spike, the threshold should be defined using a combination of user-visible and operational symptoms.

Suggested threshold criteria:

- p95 latency exceeds `[TBD]` ms for more than `[TBD]` consecutive minutes
- p99 latency exceeds `[TBD]` ms during sustained load
- error rate exceeds `[TBD]%`
- database CPU remains above `[TBD]%` for the majority of the test window
- connection acquisition delays or pool exhaustion appear in application logs or metrics
- throughput no longer scales with increased offered load

Questions to answer in analysis:

- Does the API degrade because requests queue in the application tier?
- Does the database hit CPU or connection limits first?
- Are failures dominated by timeouts, rejected connections, or slow queries?
- If the system recovers after load drops, how quickly does latency normalize?
- Is the bottleneck intrinsic to the architecture or mostly configuration-driven?

## Key Findings

Placeholder findings to replace after execution:

- The system sustained `[TBD]` RPS before p95 latency crossed the agreed serviceability threshold.
- The first meaningful degradation appeared at `[TBD]` RPM / `[TBD]` RPS.
- The dominant bottleneck was `[TBD]`.
- Database connection behavior was `[TBD: stable / constrained / saturated]` under the highest tested load.
- The application tier showed `[TBD: acceptable / elevated / severe]` error behavior once the threshold was crossed.
- Distributed Artillery execution was `[TBD: necessary / unnecessary]` to generate the desired concurrency.

## Recommendations

- Tune database connection pooling deliberately before increasing any application concurrency limits.
- Review whether the current Node.js or Lambda concurrency profile can overwhelm Postgres faster than the pool can safely absorb.
- Inspect slow queries and index usage if DB CPU or latency rises before application CPU saturation.
- Add or validate dashboards in CloudWatch or equivalent for request rate, latency percentiles, error rate, DB CPU, active connections, and slow query signals.
- If connection exhaustion is observed, evaluate smaller pool sizes per process combined with tighter concurrency controls instead of simply increasing pool limits.
- If the test shows the database is the first hard bottleneck, prioritize query efficiency and pool management over scaling the API tier.
- Repeat the ramp test after any material tuning change so the degradation point can be compared directly.

## Practical DevOps Notes

- Database connection pooling is a likely failure mode in burst testing, especially if many concurrent application workers or Lambda invocations each open their own pool.
- In serverless or horizontally scaled runtimes, aggregate connection count often becomes the limiting factor before raw CPU does.
- A rising request rate paired with flat throughput usually indicates contention, queueing, or backpressure rather than simple under-provisioning.
- Watch for misleading results caused by the load generator itself reaching CPU, network, or ephemeral port limits.
- If testing through API Gateway and Lambda, compare platform-level throttling metrics with application-level failures so infrastructure limits are not mistaken for database limits.
- CloudWatch, RDS Performance Insights, or similar tooling should be treated as required for any non-trivial load test analysis.

## Next Steps

1. Finalize a representative `POST /payments` payload for load generation.
2. Decide whether the first run should target the local stack, a shared lower environment, or both.
3. Instrument application and database dashboards before the first measured test.
4. Execute the three scenarios and populate the placeholder result tables.
5. Document the observed bottleneck and propose follow-up tuning work if needed.
