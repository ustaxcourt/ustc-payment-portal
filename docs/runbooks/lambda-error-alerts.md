# Runbook: Lambda error alerts

You were sent here by an alert. This runbook tells you what to check, in what order, and when to escalate.

## What just fired

The alert subject names the Lambda and one of two metric types:

- **`*-uncaught-critical`** — AWS Lambda's built-in `Errors` metric crossed threshold. This means a Lambda invocation threw an error past `handleError` and the Lambda runtime caught it. In normal operation this stays at zero because `handleError` catches everything. A non-zero value here usually means a handler crash, OOM, init-time failure, or a bug in `handleError` itself.
- **`*-5xx-critical`** — log-based metric. A use case called `appContext.logger.error(...)` before throwing on a 5xx path. This is the normal signal when the payment portal returns a 500-level response to a client.

Both alerts also fire a recovery (`OK`) event when the metric returns to zero — you should see a second email/SMS when service is restored.

## User-facing impact

| Alert | What the user sees |
|---|---|
| `initPayment` 5xx | Cannot start a new payment session. Pay.gov redirect URL is never returned. |
| `processPayment` 5xx | Pay.gov callback fails. Transaction status may be inconsistent. |
| `getDetails` 5xx | Polling for payment status fails. Front end sees stale data. |
| `testCert` 5xx | Test endpoint only — no real user impact. Still worth investigating. |
| Any `*-uncaught` | The Lambda is failing to invoke at all. Symptoms look like a hard outage for that endpoint. |

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
# Empty the subscribers secret. Existing subscriptions remain but no new ones are created.
aws secretsmanager update-secret \
  --secret-id "ustc/pay-gov/stg/monitoring-subscribers" \
  --secret-string "[]"

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

The `*-5xx-critical` alarm uses a CloudWatch log metric filter: `{ $.level = "error" }`. It matches any structured log emitted at error level by pino.

Two log sources contribute:

1. **Use-case-level logs** — when a use case catches an internal error and decides to throw a 5xx, it calls `appContext.logger.error(...)` first with use-case context (transaction ID, client name, etc.). Useful for triage.
2. **`handleError` itself** — every 5xx response goes through `handleError`, which emits a structured `logger.error` call with the response `statusCode` and the underlying error name/message. This is the catch-all: every 5xx response fires the alarm, even if a use case forgot to log.

4xx responses go through `handleError` too, but at `warn` level — visible in logs, never fires the alarm.

Code review convention: use `.error` only for unexpected/server-side errors. Client-facing 4xx responses (validation, conflict, not found) should use `.warn` or `.info`. `handleError` enforces this at the chokepoint, but use cases doing their own logging should follow the same convention.
