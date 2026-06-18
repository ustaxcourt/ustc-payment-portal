# PAY-329: Load Testing Spike

## Objectives and Expected Outputs

This spike is intended to produce measurable, actionable findings about the system’s behavior under load. Specifically, the following outcomes are required:

---

### 1. Failure Threshold Identification

- Identify (or reasonably project) the maximum request rate the application can sustain before degradation occurs.
- Express this threshold in:
  - requests per minute (RPM), and/or
  - requests per second (RPS)

Degradation is defined as one or more of the following:

- sustained increase in latency (especially p95/p99)
- observable error rates (4xx/5xx)
- throughput no longer scaling with increased load

---

### 2. Sustained Load Performance at 1,000 Requests per Minute

- Execute a load test at approximately **1,000 requests per minute (\~17 RPS)** for **5 minutes**

- Document:

  - achieved throughput
  - latency (p50, p95, p99)
  - error rate
  - any observable system behavior (e.g., DB impact, queuing)

- Expected result:
  - system should remain stable with minimal degradation

---

### 3. Sustained Load Performance at 10,000 Requests per Minute

- Execute a load test at approximately **10,000 requests per minute (\~167 RPS)** for **5 minutes**

- Document:

  - achieved throughput
  - latency (p50, p95, p99)
  - error rate
  - system behavior under stress

- Expected result:
  - system may exhibit degradation
  - potential bottlenecks (likely database) should become visible
