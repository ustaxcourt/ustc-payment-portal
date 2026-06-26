# PAY-215 — Alert when Pay.gov is in an unhealthy state

**Parent:** PAY-267 (Payment Portal Resilience) · **Depends on:** PAY-206 (Pay.gov health check)

## User story

> As a Sysadmin, so that I can investigate and respond accordingly, I need to be
> alerted when Pay.gov is deemed to be in an unhealthy state.

Pay.gov is deemed unhealthy in one of two ways:

1. **The Pay.gov health check** (PAY-206) — the scheduled WSDL probe reports a failure.
2. **Errors thrown from Pay.gov responses / network failures** on real payment requests.

## Context — what already exists (do not rebuild)

- **SNS topic + subscription mechanism** — `terraform/modules/monitoring/main.tf`:
  `aws_sns_topic.alerts` plus `aws_sns_topic_subscription.subs` driven by `var.subscribers`
  (protocol + endpoint, so SMS/email are already supported), and Teams routing via Chatbot.
- **Health-check unhealthy signal already alarms to that topic** — PAY-206's
  `aws_cloudwatch_metric_alarm.unhealthy` already sends `alarm_actions` **and** `ok_actions`
  to `module.monitoring.sns_topic_arn`. So "alert on unhealthy" + "alert on recovery" for
  **signal #1** is largely wired.
- **A 5xx alarm already incidentally fires on Pay.gov comms errors** — a Pay.gov transport
  failure throws `PayGovError` (≥500) → `handleError` logs 5xx → the monitoring module's
  `lambda_5xx` alarm pages Teams. That signal is coincidental, per-Lambda, and not
  Pay.gov-scoped — not a real implementation of signal #2.

## What is genuinely new in PAY-215

1. **Signal #2 as a first-class, Pay.gov-scoped metric** (errors / network failures), not
   piggybacking on generic 5xx.
2. **"Either" logic** with a single page and a clean single recovery → a composite alarm.
3. **A 20-min evaluation window (wider than the 15-min probe cadence).** The alarm `period`
   must exceed the probe cadence, or clock-aligned 15-min buckets won't phase-lock to the
   jittery 15-min probe and some land with zero datapoints → false pages under
   `treat_missing_data = breaching`. 20 min guarantees ≥1 real probe per window and matches the
   AC's "previous 20 minutes"; pair with `statistic = Minimum` so any single failure trips.
   (PAY-206's alarm is currently a single 15-min period — see decision 4.)
4. **Recipients editable without a release, PR, or merge — and without a `terraform apply`.** The
   existing shared mechanism (`monitoring-subscribers` SSM → `var.subscribers` → Terraform-managed
   `aws_sns_topic_subscription`) removes the *code* change but still needs an apply to reconcile.
   PAY-215 (Phase 1) gets the **no-apply** property by adding the Pay.gov recipients as
   **console-managed subscriptions on the existing `${prefix}-alerts` topic** — a sysadmin subscribes
   via the SNS console / `aws sns subscribe`, live on confirmation. These new subscriptions are **not**
   declared in Terraform, and the existing `aws_sns_topic_subscription.subs` is **left untouched** (see
   Key design decision 2 for why both coexist on one topic). Audience separation via a dedicated topic
   is deferred to Phase 2.

## Architecture

```
[Scheduled probe — PAY-206] ──emits──> PayGovHealthy ──> Alarm A: "healthcheck-failed"
                                                              (Min < 1 over 20m)   \
                                                                                    ├─> Composite Alarm C
[initPayment/processPayment ──emits──> PayGovError ────> Alarm B: "paygov-errors"  /   = ALARM(A) OR ALARM(B)
 transport-error catch]                                       (Sum ≥ 1 over 20m)            │ alarm_actions + ok_actions
                                                                                            ▼
                                                       ┌─────────────────────────────────────────────────────┐
                                                       │ existing ${prefix}-alerts topic                       │
                                                       │   → Teams + dev/ops  (TF/SSM subs, untouched)         │
                                                       │   → Pay.gov sysadmins (NEW console-managed subs)      │
                                                       └─────────────────────────────────────────────────────┘
                                                       Phase 1: both subscriber sets share ONE topic. New Pay.gov
                                                       subs are added via SNS console / `aws sns subscribe` (live
                                                       on confirm — no apply); existing SSM subs are not touched.
                                                       Trade-off: every subscriber gets BOTH the Lambda alarms and
                                                       the Pay.gov alert. Phase 2 (later) splits onto a dedicated topic.
```

## Key design decisions

1. **Composite alarm for "either."** `aws_cloudwatch_composite_alarm` with
   `alarm_rule = ALARM(healthcheck-failed) OR ALARM(paygov-errors)`. This is the exact
   expression of "deemed unhealthy when either…", and it gives **one** notification regardless
   of which signal trips (no double-paging if both fire) and **one** OK notification only when
   *both* clear — which is precisely "alerts are sent when Pay.gov recovers." The two child
   alarms keep `actions_enabled = false` (they exist only to feed the composite); the composite
   owns notifications.

2. **Phase 1 — reuse the existing `${prefix}-alerts` topic; add only the new (console-managed)
   Pay.gov subscriptions; leave the existing ones untouched.** The composite alarm notifies the
   existing topic (`var.alarm_sns_topic_arns`). Pay.gov sysadmins self-subscribe email/SMS via the
   SNS console / `aws sns subscribe` — live on confirmation, **no `terraform apply`, no PR/merge**.
   *Why it's safe to scope to just the new subs:* `aws_sns_topic_subscription.subs` manages only the
   instances in its own `for_each` (the SSM-derived list). Console-created subscriptions are **not in
   Terraform state**, so Terraform never sees, reconciles, or deletes them — and PAY-215 adds **no**
   new `aws_sns_topic_subscription`, so the existing SSM-managed subs stay untouched. The two sets
   coexist on one topic independently. *Decoupling note:* alarms publish to a topic ARN and
   subscriptions receive independently, so the console subs never affect alarm delivery.
   *Accepted trade-off (deferred to Phase 2):* one topic = one delivery list — SNS fans every message
   out to every subscription and CloudWatch alarms give no clean per-subscription filter, so until we
   separate, **all** subscribers (existing Lambda-alarm watchers + new Pay.gov watchers) receive both
   the Lambda alarms and the Pay.gov alert.
   **Phase 2 (later, additive):** create a dedicated `${name_prefix}-paygov-health-alerts` topic, point
   the composite at it, and have Pay.gov watchers re-subscribe there — isolating the audience without
   disturbing the existing subs. (A dedicated topic is ~free; doing it now would avoid the future
   re-subscription, at the cost of standing the topic up in this ticket.)

3. **Signal #2 via EMF metric, consistent with PAY-206.** Add `emitPayGovErrorMetric()` next to
   the existing `emitPayGovHealthMetric` and call it from the genuine *transport*-error catch
   paths — **not** business declines. Specifically:
   -  `src/useCases/initPayment.ts:186` — catch around `makeSoapRequest`.
   -  `src/useCases/processPayment.ts:153` — the generic "Error communicating with Pay.gov" branch.
   -  `src/useCases/processPayment.ts:137` — `ZodError` (response failed our schema validation).
     **Resolved: do NOT emit** — Pay.gov responded; our parser rejected the payload. That is a
     client-side schema concern, not evidence Pay.gov is down.
   -  `src/useCases/processPayment.ts:113` — `FailedTransactionError` is a *declined payment*
     = healthy Pay.gov. Must **not** emit.

4. **Retune the health alarm to the AC's 20-min / single-failure window.** PAY-206's alarm is
   currently a single 15-min period (`statistic = Maximum`, eval 1 / datapoints 1). Two problems
   for this AC: (a) `period == 15-min probe cadence`, so buckets can land empty and false-page
   under `treat_missing_data = breaching`; (b) `Maximum` masks a failed probe whenever the same
   bucket also caught a healthy one (`max(1,0)=1` ⇒ "healthy"). Retune to `statistic = Minimum`,
   `period = 1200`, `evaluation_periods = 1`, `datapoints_to_alarm = 1`, `threshold = 1`,
   `LessThanThreshold`, `treat_missing_data = breaching` — a window wider than the cadence with
   "any single failure trips." Called out explicitly since it changes PAY-206 behavior.

5. **Parameterize the error threshold.** The AC is "≥1 error in 20 min," which will page on a
   single transient blip. Implement exactly that as the default but expose
   `error_alarm_threshold` (default `1`) so ops can desensitize without a code change if it
   proves noisy.

## Files to change

### Application (signal #2)

- `src/health/payGovHealthMetric.ts` — add `emitPayGovErrorMetric()` (EMF, `PayGovError`
  Count = 1, same namespace / Environment dimension); extract a tiny shared `writeEmf()` to
  avoid duplicating the envelope.
- `src/useCases/initPayment.ts` + `src/useCases/processPayment.ts` — one
  `emitPayGovErrorMetric()` call in each genuine transport-error catch (alongside the existing
  `logger.error`).
- Tests: emitter unit test; use-case tests asserting the metric fires on transport errors and
  **does not** fire on `FailedTransactionError`.

### Terraform — `terraform/modules/paygov-health/`

- `main.tf` — retune the health alarm (20-min); add `aws_cloudwatch_metric_alarm.paygov_errors`; add
  `aws_cloudwatch_composite_alarm.unhealthy`; set the two child alarms `actions_enabled = false`, and
  on the composite `alarm_actions/ok_actions = var.alarm_sns_topic_arns` (the existing `alerts`
  topic — **no new SNS topic and no `aws_sns_topic_subscription` in Phase 1**); clear sysadmin-facing
  `alarm_description` (matching the monitoring module's heredoc style with Severity / Runbook).
- `variables.tf` — add `error_alarm_threshold` (default 1), `health_window_seconds` (default 1200).
- Env wiring (`terraform/environments/{stg,prod}/main.tf`) — already pass
  `alarm_sns_topic_arns = [module.monitoring.sns_topic_arn]`; no new inputs. (Dev stays SNS-less.)
- *Phase 2 (later):* add `aws_sns_topic.paygov_alerts` + an `outputs.tf` export, and switch the
  composite's actions to `concat(var.alarm_sns_topic_arns, [aws_sns_topic.paygov_alerts.arn])`.

### Terraform — `terraform/modules/iam/role-deployer.tf`

- Add `cloudwatch:PutCompositeAlarm` to the existing alarm statement (`DeleteAlarms` already
  covers composite deletion). That is the only IAM delta in Phase 1 — no new SNS topic, and no
  subscription perms (the new subs are console / sysadmin-owned). (Phase 2's dedicated topic is
  already covered by the deployer's existing `sns:CreateTopic` on `${prefix}-*`.)

### Docs

- A short runbook: how a sysadmin adds/removes an email or phone number by subscribing directly to
  the existing `${prefix}-alerts` topic via the SNS console or `aws sns subscribe` (live on
  confirmation, no apply), plus the operational prerequisites below. (Note: in Phase 1 they'll also
  receive the Lambda-alarm notifications on that topic.)

## AC → coverage map

| Acceptance criterion | How it is met |
|---|---|
| Recipients configurable by Sysadmin without a release, PR, or merge | Console-managed subscriptions on the existing `alerts` topic (no TF subs added) — live on confirm, no apply |
| Alerts via SMS or Email (other channels welcome) | SNS email/SMS subscriptions; Teams still gets it via the alerts topic |
| Alert language indicating Pay.gov unhealthy | Composite `alarm_description` (sysadmin-facing copy) |
| Unhealthy = ≥1 failed health check in 20 min | Alarm A: `Minimum < 1` over 1200s |
| Unhealthy = ≥1 Pay.gov error in 20 min | Alarm B: `Sum ≥ threshold` over 1200s on `PayGovError` |
| Alert sent when unhealthy | Composite `alarm_actions` |
| Alert sent on recovery | Composite `ok_actions` |

## Operational prerequisites (sysadmin / ops, not code)

- **SNS SMS** requires the account to be out of the SMS sandbox (or sandbox-verified numbers)
  and may need an origination identity / spend limit — flag for ops before stg/prod.
- **Email** subscriptions require the recipient to click the confirmation link.

## Verification

- `npm test` (emitter + use-case suites), `node_modules/.bin/biome lint`,
  `terraform fmt` / `validate`.
- Dev apply, then: force a probe failure (point `SOAP_URL` at a bad host) → confirm Alarm A →
  composite → test email/SMS; trigger a Pay.gov comms error → confirm Alarm B path; restore →
  confirm a single OK/recovery notification.

