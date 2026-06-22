# PAY-329: Load Testing Spike

## Objectives and Expected Outputs

This spike is intended to produce measurable, actionable findings about the system’s behavior under load. Specifically, the following outcomes are required.

---

## Test Execution

### Run Artillery Tests (Local)

Run Artillery tests locally by combining scenario files with environment (load) configurations:

```bash
# Make sure you have Artillery installed globally or use npx

# Go to the directory containing your Artillery configuration
cd docs/architecture/proposals/PAY-329-load-testing/artillery

# Baseline (1,000 RPM)
artillery run scenarios/init-only.yml \
  --config environments/1000-rpm.yml \
  --output results/1000-rpm-results.json

# Stress (10,000 RPM)
artillery run scenarios/init-only.yml \
  --config environments/10000-rpm.yml \
  --output results/10000-rpm-results.json

# Ramp (threshold identification)
artillery run scenarios/full-flow.yml \
  --config environments/ramp-test.yml \
  --output results/ramp-test-results.json
```

---

## Run Artillery Tests (AWS Lambda - Distributed Load)

Use AWS Lambda to generate distributed, high-scale load. This is recommended for realistic performance testing beyond local machine limits.

> ⚠️ **Important:** The `target` in your config **must NOT be `localhost`**. It must be a publicly reachable endpoint (e.g., API Gateway, dev environment URL).

### Prerequisites

- AWS credentials configured (`aws configure` or environment variables)
- IAM permissions for Lambda, S3, SQS (AdministratorAccess is acceptable for testing)

---

### Example Commands

```bash
# Baseline (1,000 RPM)
artillery run-lambda scenarios/init-only.yml \
  --config environments/1000-rpm.yml \
  --target https://your-api-endpoint.com \
  --output results/1000-rpm-results.json \
  --region us-west-2 \
  --count 2

# Stress (10,000 RPM)
artillery run-lambda scenarios/init-only.yml \
  --config environments/10000-rpm.yml \
  --target https://your-api-endpoint.com \
  --output results/10000-rpm-results.json \
  --region us-west-2 \
  --count 10

# Ramp (threshold identification)
artillery run-lambda scenarios/full-flow.yml \
  --config environments/ramp-test.yml \
  --target https://your-api-endpoint.com \
  --output results/ramp-test-results.json \
  --region us-west-2 \
  --count 5
```

---

### Notes on Lambda Execution

- **`--count` controls the number of distributed load generators**
  Each worker runs your scenario independently.

- **Total load is multiplied across workers**

  ```
  total load ≈ config load × count
  ```

- **Maximum test duration is \~15 minutes** (Lambda limit)

- All scenario files, configs, and JS processors are **automatically bundled and uploaded**

---

## Generate Reports

```bash
artillery report results/1000-rpm-results.json > reports/1000-rpm-report.html
artillery report results/10000-rpm-results.json > reports/10000-rpm-report.html
artillery report results/ramp-test-results.json > reports/ramp-test-report.html
```

> Report format is identical for both local (`run`) and distributed (`run-lambda`) executions

---

## 1. Failure Threshold Identification

- Identify (or reasonably project) the maximum request rate the application can sustain before degradation occurs.
- Express this threshold in:
  - requests per minute (RPM), and/or
  - requests per second (RPS)

Degradation is defined as one or more of the following:

- sustained increase in latency (especially p95/p99)
- observable error rates (4xx/5xx)
- throughput no longer scaling with increased load

---

## 2. Sustained Load Performance at 1,000 Requests per Minute

- Execute a load test at approximately **1,000 requests per minute (\~17 RPS)** for **5 minutes**

- Document:

  - achieved throughput
  - latency (p50, p95, p99)
  - error rate
  - any observable system behavior (e.g., database impact, queuing, resource utilization)

- Expected result:

  - system remains stable with minimal latency increase
  - negligible or zero error rate

---

## 3. Sustained Load Performance at 10,000 Requests per Minute

- Execute a load test at approximately **10,000 requests per minute (\~167 RPS)** for **5 minutes**

- Document:

  - achieved throughput
  - latency (p50, p95, p99)
  - error rate
  - system behavior under stress (e.g., database contention, connection saturation)

- Expected result:

  - noticeable latency increase
  - possible error rates
  - bottlenecks (likely database-related) become visible

---

## Recommended Workflow

1. Run tests locally (`artillery run`) to validate flows and correctness
2. Switch to distributed testing (`artillery run-lambda`) for realistic load
3. Adjust `--count` carefully to avoid unintentionally overloading the system
