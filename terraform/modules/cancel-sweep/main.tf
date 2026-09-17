# EventBridge invokes the cancelExpired Lambda, which moves `initiated` rows past the Pay.gov
# token TTL to `cancelled` / `failed`. Names must derive from name_prefix — the CI read-only and
# deployer IAM policies are scoped to `${prefix}*` ARNs, so drifting fails the plan.

resource "aws_cloudwatch_event_rule" "cancel_sweep" {
  name                = "${var.name_prefix}-cancel-sweep"
  description         = "Periodic sweep cancelling abandoned Pay.gov sessions (invokes the cancelExpired Lambda)"
  schedule_expression = var.schedule_expression
  state               = var.schedule_enabled ? "ENABLED" : "DISABLED"
  tags                = var.tags
}

resource "aws_cloudwatch_event_target" "cancel_sweep" {
  rule      = aws_cloudwatch_event_rule.cancel_sweep.name
  target_id = "cancelExpired"
  arn       = var.cancel_expired_function_arn
}

resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowEventBridgeCancelSweep"
  action        = "lambda:InvokeFunction"
  function_name = var.cancel_expired_function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.cancel_sweep.arn
}

# A run that cannot reach the database cancels nothing and must not look like a quiet day.
resource "aws_cloudwatch_metric_alarm" "sweep_failed" {
  alarm_name          = "${var.name_prefix}-cancel-sweep-failed"
  alarm_description   = <<-EOT
    The cancellation sweep Lambda is erroring. Abandoned payments stay `initiated` and keep
    showing as pending on the dashboard until it recovers.
    Service: payment-portal (${var.environment})
    Severity: warning
    Runbook: ${var.runbook_url}
  EOT
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = var.cancel_expired_function_name }
  statistic           = "Sum"
  period              = var.spike_window_seconds
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  # Lambda emits Errors only on failure, so a healthy window has no datapoint. Liveness is
  # the sweep_stalled alarm's job, on a metric we emit every run.
  treat_missing_data = "notBreaching"

  actions_enabled = true
  alarm_actions   = var.alarm_sns_topic_arns
  ok_actions      = var.alarm_sns_topic_arns
  tags            = var.tags
}

# Steady state is a handful per window; a spike points upstream.
resource "aws_cloudwatch_metric_alarm" "cancellation_spike" {
  alarm_name          = "${var.name_prefix}-cancel-sweep-spike"
  alarm_description   = <<-EOT
    Abandoned Pay.gov sessions are being cancelled at an unusual rate (>= ${var.spike_alarm_threshold}
    in ${var.spike_window_seconds}s). Payers are reaching Pay.gov and not completing — suspect a
    broken redirect URL, a Pay.gov outage, or a client integration regression.
    Service: payment-portal (${var.environment})
    Severity: warning
    Runbook: ${var.runbook_url}
  EOT
  namespace           = "USTC/PaymentPortal"
  metric_name         = "TransactionsCancelled"
  dimensions          = { Environment = var.environment }
  statistic           = "Sum"
  period              = var.spike_window_seconds
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = var.spike_alarm_threshold
  # A window with no sweep is sweep_failed's job, not this one.
  treat_missing_data = "notBreaching"

  actions_enabled = true
  alarm_actions   = var.alarm_sns_topic_arns
  ok_actions      = var.alarm_sns_topic_arns
  tags            = var.tags
}

# Liveness. TransactionsCancelled is emitted on every run including zero, so an absent
# datapoint means the sweep did not run at all.
resource "aws_cloudwatch_metric_alarm" "sweep_stalled" {
  alarm_name        = "${var.name_prefix}-cancel-sweep-stalled"
  alarm_description = <<-EOT
    The cancellation sweep has not reported in ${var.spike_window_seconds}s. Abandoned payments
    stay `initiated` and keep showing as pending until it resumes. Check the EventBridge rule is
    enabled and delivering.
    Service: payment-portal (${var.environment})
    Severity: warning
    Runbook: ${var.runbook_url}
  EOT
  namespace         = "USTC/PaymentPortal"
  metric_name       = "TransactionsCancelled"
  dimensions        = { Environment = var.environment }
  statistic         = "SampleCount"

  period              = var.spike_window_seconds
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  comparison_operator = "LessThanThreshold"
  threshold           = 1
  # Only once the schedule is on; a dark deploy legitimately reports nothing.
  treat_missing_data = var.schedule_enabled ? "breaching" : "notBreaching"

  actions_enabled = true
  alarm_actions   = var.alarm_sns_topic_arns
  ok_actions      = var.alarm_sns_topic_arns
  tags            = var.tags
}
