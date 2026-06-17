# PAY-206 — Implementation Overview

Companion to [PAY-206-paygov-health-check.md](./PAY-206-paygov-health-check.md). Documents what
was built and the decisions behind it.

## Summary

A non-transactional Pay.gov health check. A probe fetches the Pay.gov WSDL (exercising the TLS
cert + confirming the server responds, without starting a collection) and publishes the result as
a **CloudWatch metric** via Embedded Metric Format. A **CloudWatch alarm** on that metric is the
durable "Is Pay.gov healthy?" answer and the sysadmin alert — there is **no database table**. The
existing `/test` endpoint is now an on-demand health probe returning JSON.

## Why CloudWatch and not a table

- Health is judged by *"our usual APIs **as well as** this health check"* — the payment Lambdas
  already log Pay.gov failures, so a metric/log pipeline is where both signals converge. A table
  would only ever hold the probe's view.
- The user-story consumer is a sysadmin (alert) + dashboard, not a per-request hot-path read. An
  alarm delivers the alert; the metric feeds the dashboard.
- No schema, model, migration, or retention to maintain.

(Earlier drafts of this plan used an RDS `pay_gov_health` table. It was backed out — see
"Removed" below — because it was a second source of truth for what logs/metrics already capture.)

## How it flows

```
EventBridge (rate 15 min) ─► payGovHealthCheck Lambda ─┐
                                                        ├─► checkPayGovHealth(appContext)
/test (testCert.ts, on demand) ─────────────────────────┘        │
                                                                  ├─ probePayGov() ─► fetch(`${SOAP_URL}?wsdl`)
                                                                  └─ emit EMF metric: PayGovHealthy {1|0}, PayGovLatencyMs
                                                                            │
                                                   CloudWatch metric ──► Alarm ──► SNS ──► sysadmin / dashboard
```

## Changes by file (application code)

| File | Change |
|---|---|
| `src/health/payGovHealth.ts` | **New.** `probePayGov()` (WSDL probe, never throws) and `checkPayGovHealth()` (probe + EMF metric `PayGovHealthy`/`PayGovLatencyMs` under namespace `USTC/PaymentPortal`, dimensioned by `Environment`). |
| `src/health/payGovHealth.test.ts` | **New.** Probe healthy/unhealthy/throw; metric emission asserts `PayGovHealthy` 1/0 + namespace. |
| `src/testCert.ts` | **Modified.** `/test` now calls `checkPayGovHealth()` and returns JSON (200/503) instead of the raw WSDL body. |
| `src/testCert.test.ts` | **Modified.** New JSON response contract. |

No changes to `AppContext`, `appContext.ts`, `initPayment.ts`, `.env.example`, or
`build-lambda.sh` — earlier edits there were reverted as part of dropping the table.

## Infrastructure (not yet built — see plan §B)

The scheduled Lambda registration, EventBridge `rate(15 minutes)` rule, and the CloudWatch alarm
are the remaining Terraform work. They satisfy AC#1 ("every 15 minutes") and deliver the alert.
The application code above is the probe + metric they depend on, and is complete.

## Key decisions

1. **CloudWatch metric + alarm as the "data store."** No table. The alarm is the durable,
   queryable health answer and the alert; the metric feeds dashboards.
2. **EMF, not `PutMetricData` or a metric filter on log strings.** EMF is fire-and-forget (no
   synchronous API call, no IAM, no dependency) and emits an intentional metric contract rather
   than coupling health to human-readable log text.
3. **`probePayGov` never throws.** A network failure to Pay.gov is the unhealthy signal, returned
   as a result — not an exception callers must handle.
4. **`/test` shares `checkPayGovHealth`.** One code path for the scheduled probe and the on-demand
   endpoint; both emit the same metric.

## Removed (backed out from the table-based draft)

These were created, then removed when the design moved to CloudWatch. If present in your working
tree, delete them:

```
rm db/migrations/20260615000000_create_pay_gov_health_table.ts
rm src/db/PayGovHealthModel.ts
rm src/db/PayGovHealthModel.test.ts
```

## Verification performed

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean.
- `npx jest` (affected suites: payGovHealth, testCert, initPayment, appContext) — **38 passed**.
  - Pre-existing, unrelated failure elsewhere: `scripts/start-pay-gov-test-server.test.js` fails
    locally because `@ustaxcourt/ustc-pay-gov-test-server/dist/server.js` isn't built in this
    environment. Not touched by this change.

## Deferred
- The app reading health synchronously to alter request behavior ("respond appropriately").
- Dashboard surface beyond the raw metric.
