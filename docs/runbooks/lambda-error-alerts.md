# Runbook: Lambda error alerts

You were sent here by an alert. This runbook tells you what to check, in what order, and when to escalate.

## What just fired

The alert subject names the Lambda and one of these metric types:

- **`*-uncaught-critical`** — AWS Lambda's built-in `Errors` metric crossed threshold. This means a Lambda invocation threw an error past `handleError` and the Lambda runtime caught it. In normal operation this stays at zero because `handleError` catches everything. A non-zero value here usually means a handler crash, OOM, init-time failure, or a bug in `handleError` itself.
- **`*-5xx-critical`** — log-based metric. A use case called `appContext.logger.error(...)` before throwing on a 5xx path. This is the normal signal when the payment portal returns a 500-level response to a client.
- **`*-init-payment-conflict-warning`** / **`*-process-payment-conflict-warning`** — **warning**, not critical. Elevated HTTP 409 concurrency conflicts (the `InitPaymentConflict` / `ProcessPaymentConflict` EMF metrics). These are the payment portal's idempotency guard working as designed — no client saw a 5xx and Pay.gov was not called twice. A sustained spike is what's actionable, not a single conflict. See [Concurrency conflict warnings (409)](#concurrency-conflict-warnings-409) below before touching anything else in this runbook.

All of these also fire a recovery (`OK`) event when the metric returns to zero — you should see a second email/SMS when service is restored.

## User-facing impact

| Alert | What the user sees |
|---|---|
| `initPayment` 5xx | Cannot start a new payment session. Pay.gov redirect URL is never returned. |
| `processPayment` 5xx | Pay.gov callback fails. Transaction status may be inconsistent. |
| `getDetails` 5xx | Polling for payment status fails. Front end sees stale data. |
| Any `*-uncaught` | The Lambda is failing to invoke at all. Symptoms look like a hard outage for that endpoint. |
| `*-conflict-warning` | Nothing directly. The duplicate request got an HTTP 409 and the caller is expected to retry with backoff. Impact only appears if the conflict rate is high enough that a legitimate caller cannot make progress. |

## Concurrency conflict warnings (409)

**This section applies only to `*-init-payment-conflict-warning` and `*-process-payment-conflict-warning`. If you were paged for a `*-5xx` or `*-uncaught` alarm, skip to [First three things to check](#first-three-things-to-check).**

### What this alarm means

These alarms watch the `InitPaymentConflict` and `ProcessPaymentConflict` EMF counters (namespace `USTC/PaymentPortal`, `Environment` dimension). They increment whenever the portal returns **HTTP 409** to reject a duplicate, concurrent payment request for a transaction reference that is already in-flight. This is the idempotency protection from PAY-344 doing its job: it guarantees a taxpayer's double-click, or an automated retry loop in a calling app, never fires two SOAP handshakes at Pay.gov for the same obligation.

A **single** 409 is normal and expected — it is not worth paging on, which is why these are `warning` severity with a threshold well above 1 (`Sum >= threshold`, default 25, over 5-minute periods, 2 of 3 datapoints). The alarm fires only on a **sustained spike**, which means something upstream is generating abnormal duplicate volume, or in-flight rows are not clearing.

### Conflict reasons

Each conflict log/EMF line carries a `Reason` property. Filter on it to tell the causes apart:

| Metric | `Reason` | Meaning |
|---|---|---|
| `InitPaymentConflict` | `processing_in_flight` | A new `POST /init` arrived while a prior attempt for the same reference is actively `processing` (a `POST /process` is finalizing it). Rejected rather than re-initiated. |
| `InitPaymentConflict` | `persist_race` | Two `POST /init` calls raced to insert; the partial unique index `idx_transactions_unique_active` let only one win. The loser gets the same 409. |
| `ProcessPaymentConflict` | (claim lost) | Two `POST /process` calls raced to claim the same token; `claimForProcessing`'s atomic compare-and-swap (`initiated` → `processing`) let only one win. |

### What to check

```bash
# Replace {lambda} (initPayment | processPayment) and env. Group by Reason to see the dominant cause.
aws logs tail /aws/lambda/ustc-payment-portal-stg-{lambda} --since 30m --follow \
  --filter-pattern '{ $.statusCode = 409 }'
```

1. **Is it one client or many?** Group the 409 logs by `clientName` / `transactionReferenceId`. A single reference repeating hundreds of times points at a stuck retry loop in one calling app — contact that app's team; the fix is on their side (add backoff, stop the loop). Broad spread across references points at a genuine concurrency surge.
2. **Are rows stuck in `processing`?** If `Reason=processing_in_flight` dominates, a `POST /process` may have died mid-flight (Lambda timeout/crash) and left a row `processing`. Legitimate retries will 409 until the row ages past `PROCESSING_STALE_MS` (see [`src/db/TransactionModel.ts`](../../src/db/TransactionModel.ts)), after which it is reclaimable. Correlate with any concurrent `*-5xx`/`*-uncaught` alarm on `processPayment`, and check for Lambda timeouts in the logs. If a stale row is blocking a real payment, the underlying `processPayment` failure — not the 409 — is the incident; triage it via the 5xx flow below.
3. **Recent deploys / traffic changes?** Same as the 5xx flow — see [Recent deploys](#3-recent-deploys). A conflict spike that starts right after a deploy suggests a regression in the in-flight/claim logic; a spike with no deploy suggests an upstream traffic or retry-config change.

### When to escalate

If the 409s trace to the portal itself (stuck `processing` rows from repeated `processPayment` crashes, or conflicts with no plausible duplicate-request source), treat it as a `processPayment` incident and follow the escalation table below. If they trace to a misbehaving calling app, it is not a portal outage — notify that app's team and, if the volume is degrading the shared endpoint, consider muting this specific alarm (see [How to silence a known false positive](#how-to-silence-a-known-false-positive)) with a tracking ticket while they fix their retry logic.

## First three things to check

In order. Each is cheap; do them sequentially.

### 1. CloudWatch Logs for the affected Lambda

```bash
# Replace {lambda} with the function key from the alert (initPayment, processPayment, etc.)
aws logs tail /aws/lambda/ustc-payment-portal-stg-{lambda} --since 30m --follow
```

Look for:
- Repeated `"level":"error"` entries — read the `errorName` and `errorMessage` fields
- Stack traces pointing to a specific file/line
- Whether all requests are failing or only some

### 2. Pay.gov status

Most Lambda 5xx errors in this codebase trace back to Pay.gov being unreachable, unhealthy, or returning a malformed SOAP response.

- Check Pay.gov dev/QA/prod status page (URL varies by env — see config in `terraform/environments/{env}/locals.tf` under `soap_url`)
- Try the SOAP endpoint directly with `curl` from a machine outside the VPC

### 3. Recent deploys

```bash
git log --oneline --since="2 hours ago"
```

Correlate the alert timestamp with the last successful deploy. If the alert started firing within minutes of a deploy, the deploy is the prime suspect — start with `git diff` of the merged PR.

## Common past causes

This list grows as incidents happen. Update it after each incident.

| Date | Symptom | Root cause | Fix |
|---|---|---|---|
| (none yet) | — | — | — |

## Escalation

| Level | Who | When |
|---|---|---|
| L1 | On-call engineer (you) | First 30 min |
| L2 | Payments tech lead | If unresolved at 30 min, or if Pay.gov-side issue |
| L3 | PO + ISD if account/network-level | If 1+ hour or if SOAP endpoint itself is unreachable from VPC |

Contact info: see team page (link to be added).

## How to silence a known false positive

If you've confirmed an alert is firing on a known harmless cause and you want to suppress paging while the underlying fix is in flight:

**Temporary mute (preferred — auto-reverts on next deploy):**

```bash
# Empty the subscribers parameter. Existing subscriptions remain but no new ones are created.
aws ssm put-parameter \
  --name "/ustc/pay-gov/stg/monitoring-subscribers" \
  --type SecureString \
  --overwrite \
  --value "[]"

# Unsubscribe specific subscription
aws sns list-subscriptions-by-topic \
  --topic-arn arn:aws:sns:us-east-1:747103385969:ustc-payment-portal-stg-alerts
aws sns unsubscribe --subscription-arn <arn-from-above>
```

**Disable a specific alarm (use with caution):**

```bash
aws cloudwatch disable-alarm-actions \
  --alarm-names ustc-payment-portal-stg-{lambda}-{metric}-critical
```

Re-enable with `enable-alarm-actions`. Always file a ticket to track *why* the alarm was muted and a date by which it should be re-enabled.

## How the 5xx detection works

The `*-5xx-critical` alarm uses a CloudWatch log metric filter that requires **both**:

```text
{ ($.level = "error") && ($.statusCode >= 500) }
```

Only `handleError`'s structured log emits `statusCode` — it's the single source of truth for "this response was a 5xx." Every 5xx response goes through `handleError`, which emits `{"level":"error","statusCode":<5xx>,...}`; every 4xx response also goes through `handleError` but at `warn` level with `statusCode < 500`. Neither matches the filter for the wrong reason.

Use-case-level `appContext.logger.error(...)` calls (without `statusCode`) stay in CloudWatch Logs for triage context but **do not trigger the alarm** — the filter ignores them because the `statusCode` condition can't match a missing field.

This means the alarm only fires for real 5xx responses, even if a use case logs at error level on a 4xx path (e.g., `initPayment` logging before throwing a `ConflictError`/409).
