# PAY-206 — Add health check for Pay.gov

## Context

A sysadmin needs to know whether Pay.gov is healthy so they can be alerted on an outage and feed
the status into a dashboard. The check must be **non-transactional** (no `startOnlineCollection`)
and must not spam Pay.gov — cadence ~15 minutes. The ticket suggests leveraging the existing
`testCert` probe, which fetches `${SOAP_URL}?wsdl` (exercises the TLS cert + confirms the server
responds) without creating a transaction.

### Acceptance criteria → design
- *"Automated regular requests every ~15 min"* → an **EventBridge schedule** invokes the existing
  `testCert` Lambda every 15 minutes.
- *"Calculated health cached in a local data store the application can use"* → each probe publishes
  a **CloudWatch metric** (`PayGovHealthy`); a **CloudWatch alarm** is the durable, queryable
  "is Pay.gov healthy?" answer and the outage-alert / dashboard signal.

### Why CloudWatch, why reuse `testCert`
The store has to be shared and durable across a serverless fleet, and the real consumer is a
sysadmin + dashboard — CloudWatch metric + alarm is purpose-built for that, with no schema to
maintain. `testCert` already performs exactly this probe and is already built/deployed, so reusing
it (vs. a new Lambda) keeps the change to **app code + one small TF module**, with **zero
CI/workflow changes**.

### Reuse of PAY-208 monitoring
PAY-208 added `terraform/modules/monitoring` (SNS alerts topic + Teams chatbot), wired in **stg and
prod**. The Pay.gov alarm reuses that topic (`module.monitoring.sns_topic_arn`) so an outage pages
through the same Teams channel — no new SNS of our own. Dev has no monitoring module, so the dev
alarm is notification-less (still visible on dashboards/console).

---

## Implementation

### A. Application code
1. **`src/health/payGovHealthMetric.ts`** — `emitPayGovHealthMetric(healthy, latencyMs)`: publishes
   a CloudWatch **EMF** stdout line — `PayGovHealthy` (1/0) and `PayGovLatencyMs`, namespace
   `USTC/PaymentPortal`, dimensioned by `Environment` (`getAppEnv()`). No PutMetricData, no extra IAM.
2. **`src/testCert.ts`** — time the probe and call `emitPayGovHealthMetric(result.ok, latency)`
   after the fetch (and `false` in the `catch`). HTTP response unchanged, so the on-demand `/test`
   endpoint is unaffected; EventBridge ignores the return value.

### B. Infrastructure — `terraform/modules/paygov-health/`
- `aws_cloudwatch_event_rule` (`rate(15 minutes)`) → `aws_cloudwatch_event_target` (testCert) →
  `aws_lambda_permission` (allow `events.amazonaws.com`).
- `aws_cloudwatch_metric_alarm` on `PayGovHealthy` — `Maximum < 1` for 2 consecutive 15-min periods
  (no successful probe for ~30 min), `treat_missing_data = "breaching"` (a dead probe is itself a
  signal). `alarm_actions` = the passed SNS topic ARNs (optional).

Wired into **dev** (count-gated to the real dev env, not PR workspaces, no SNS), **stg**, and
**prod** (both passing `[module.monitoring.sns_topic_arn]`).

### C. IAM
The deployer policy (now in `terraform/modules/iam/role-deployer.tf`) already grants scoped
`cloudwatch:PutMetricAlarm` and `sns:*`, but **no EventBridge** — added a scoped `events:*`
statement (`rule/${lambda_name_prefix}-*`) so the apply can manage the schedule rule.

---

## Files
| File | Action |
|---|---|
| `src/health/payGovHealthMetric.ts` / `.test.ts` | New — EMF emitter + test |
| `src/testCert.ts` / `src/testCert.test.ts` | Edit — emit metric; add metric tests |
| `terraform/modules/paygov-health/{main,variables,versions}.tf` | New — schedule + alarm |
| `terraform/environments/{dev,stg,prod}/main.tf` | Edit — instantiate the module |
| `terraform/modules/iam/role-deployer.tf` | Edit — scoped EventBridge permissions |

No DB migration, no new Lambda, no CI/workflow changes.

---

## Verification
- `npx tsc --noEmit`, `npm run lint` (biome), `npx jest` — green.
- `terraform fmt -check` + `terraform validate` on the module.
- Deployed (needs a real `terraform apply`): confirm `USTC/PaymentPortal / PayGovHealthy` datapoints
  land every ~15 min; force an outage in a scratch env (point `SOAP_URL` at an unreachable host) and
  confirm the metric drops to 0 and the alarm → ALARM and pages via Teams (stg/prod).

## Deferred
- The application *consuming* health to alter request behavior ("respond appropriately").
