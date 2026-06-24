
# Runbook: API Gateway throttle (429) alerts

You were sent here by an alert. This runbook tells you what to check, in what order, and when to escalate.

## What just fired

The alert is `ustc-payment-portal-{env}-api-gateway-429-critical`. It fires when at least one 429 response appears in the API Gateway access logs within a 5-minute window during a 30-minute evaluation period.

429s are enforced by API Gateway before the request reaches Lambda — Lambda is never invoked for throttled requests. Lambda error metrics and Lambda logs will be silent when this alarm fires. The signal lives entirely in the access log group.

Per-endpoint limits (sustained rate / burst):

| Route | Sustained | Burst |
|---|---|---|
| `POST /init` | 100 req/min (~2 req/s) | 10 |
| `POST /process` | 100 req/min (~2 req/s) | 10 |
| `GET /details/{transactionReferenceId}` | 5,000 req/min (~84 req/s) | 150 |

A single burst (e.g., a CI run firing multiple `/init` requests back-to-back) can exhaust the burst bucket and produce a 429 without sustained overload. See [How the detection works](#how-the-detection-works) for the distinction.

## User-facing impact

| Throttled route | What the user sees |
|---|---|
| `POST /init` | Cannot start a new payment session. The calling application receives 429 instead of a Pay.gov redirect URL. |
| `POST /process` | Pay.gov callback cannot complete. Transaction status may stay in `initiated`. |
| `GET /details/{transactionReferenceId}` | Status polling is rate-limited. Front end sees stale data until the rate window clears. |

## First three things to check

In order. Each is cheap; do them sequentially.

### 1. Access logs — who is throttled and how often

```bash
# Replace {env} with stg or prod
aws logs filter-log-events \
  --log-group-name /aws/apigateway/{env} \
  --start-time $(date -v-30M +%s)000 \
  --filter-pattern '{ $.status = "429" }' \
  --query 'events[*].message' \
  --output text
```

Look for:
- Which `resourcePath` is generating 429s — `/init`, `/process`, or `/details`
- Whether a single `ip` accounts for most of the volume
- Whether 429s are clustered (burst) or distributed across the window (sustained rate exceeded)
- The `extendedRequestId` field — provide this to AWS Support if you need to escalate; unlike `requestId`, it cannot be spoofed by the caller

A handful of 429s clustered at one timestamp is likely a bursty-but-legitimate caller (CI, client retry logic, automated test). Sustained 429s spread across minutes suggests a client in a retry loop or a genuine overload scenario.

### 2. Correlate with CI / integration test runs

```bash
# Check if a deploy or integration test run started around the alert time
git log --oneline --since="2 hours ago"
```

If a staging deploy or integration test run happened within minutes of the alert, CI is the most likely source. Integration tests make multiple requests to `/init` and `/process` in rapid succession and can exhaust the burst bucket without any client-side problem.

### 3. Check whether the calling account is expected

The access logs include `ip` but not the calling AWS account ID. If the source IP is unfamiliar or traffic volume is unusually high:

```bash
# List recent CloudWatch metrics for the 429 custom namespace
aws cloudwatch get-metric-statistics \
  --namespace "ustc-payment-portal-{env}/throttles" \
  --metric-name "api-gateway-429" \
  --period 300 \
  --start-time $(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --statistics Sum
```

If you see a high and sustained count (not a single spike), investigate whether the SigV4-signed caller is in an unexpected retry loop or whether a new client integration started without coordinating rate expectations.

## Common past causes

This list grows as incidents happen. Update it after each incident.

| Date | Symptom | Root cause | Fix |
|---|---|---|---|
| (none yet) | — | — | — |

## Escalation

| Level | Who | When |
|---|---|---|
| L1 | On-call engineer (you) | First 30 min |
| L2 | Payments tech lead | If a legitimate client is consistently hitting limits and limits need tuning |
| L3 | PO + client team | If the throttled caller is an external consumer that needs coordination |

Contact info: see team page (link to be added).

## How to silence a known false positive

If you've confirmed the alert is firing on a known harmless cause (e.g., a CI run on stg) and want to suppress paging while the underlying fix is in flight:

**Temporary mute (preferred — auto-reverts on next deploy):**

```bash
# Empty the subscribers parameter. Existing subscriptions remain but no new ones are created.
aws ssm put-parameter \
  --name "/ustc/pay-gov/{env}/monitoring-subscribers" \
  --type SecureString \
  --overwrite \
  --value "[]"

# Unsubscribe specific subscription
aws sns list-subscriptions-by-topic \
  --topic-arn arn:aws:sns:us-east-1:747103385969:ustc-payment-portal-{env}-alerts
aws sns unsubscribe --subscription-arn <arn-from-above>
```

**Disable the specific alarm (use with caution):**

```bash
aws cloudwatch disable-alarm-actions \
  --alarm-names ustc-payment-portal-{env}-api-gateway-429-critical
```

Re-enable with `enable-alarm-actions`. Always file a ticket in **JIRA** to track why the alarm was muted and a date by which it should be re-enabled.

## How the detection works

API Gateway access logging writes one JSON record per request to `/aws/apigateway/{env}`. A CloudWatch log metric filter watches that log group for:

```text
{ $.status = "429" }
```

Each matching record increments the custom metric `ustc-payment-portal-{env}/throttles/api-gateway-429` by 1. A `default_value = "0"` ensures the metric reports zero (not missing) during quiet periods so `treat_missing_data = notBreaching` behaves correctly.

The alarm fires when the `Sum` of that metric reaches ≥ 1 in any single 5-minute evaluation period within a 30-minute window (`evaluation_periods = 6`, `datapoints_to_alarm = 1`).

**Why not `AWS/ApiGateway 4XXError`?** The built-in `4XXError` metric counts all client errors (400, 401, 403, 404, 429, etc.) and cannot be filtered by status code. We use the access log approach so this alarm fires only on throttles, leaving `4XXError` untouched for future broad 4xx alerting.

**Throttling is best-effort**: AWS applies limits on a best-effort basis — they are targets, not hard ceilings. A request may be throttled slightly before or after the configured limit depending on account-level load. Treat the limits as approximate guides, not precise trip-points.

**Burst vs. sustained**: API Gateway uses a token-bucket algorithm. The burst value is the initial bucket depth (e.g., 10 for `/init`). A client can send up to 10 requests instantaneously without throttling; thereafter it is limited to the sustained rate (~2 req/s). A bursty-but-legitimate caller (CI, client that queues requests) can drain the burst bucket and see a 429 even though it would pass a sustained-rate check. If this alarm fires consistently on CI runs, consider raising the burst limits via the `throttle_burst_limit` variable in the api-gateway module.
