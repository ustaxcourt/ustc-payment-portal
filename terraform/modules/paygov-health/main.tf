# Scheduled Pay.gov health probe. An EventBridge rule invokes the existing testCert Lambda on a fixed cadence.
# Each invocation probes Pay.gov's WSDL and publishes a `PayGovHealthy` metric

resource "aws_cloudwatch_event_rule" "health" {
  name                = "${var.name_prefix}-paygov-health"
  description         = "Periodic Pay.gov health probe (invokes the testCert Lambda)"
  schedule_expression = "rate(15 minutes)"
  tags                = var.tags
}

resource "aws_cloudwatch_event_target" "health" {
  rule      = aws_cloudwatch_event_rule.health.name
  target_id = "testCert"
  arn       = var.testcert_function_arn
  input     = jsonencode({ healthProbe = true })
}

resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowEventBridgePayGovHealth"
  action        = "lambda:InvokeFunction"
  function_name = var.testcert_function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.health.arn
}

# Child alarm A — the scheduled WSDL probe is failing.
resource "aws_cloudwatch_metric_alarm" "healthcheck_failed" {
  alarm_name          = "${var.name_prefix}-paygov-healthcheck-failed"
  alarm_description   = "Pay.gov WSDL health probe reported unhealthy (no 2xx), or stopped reporting, within the health window. Child of ${var.name_prefix}-paygov-unhealthy-composite."
  namespace           = "USTC/PaymentPortal"
  metric_name         = "PayGovHealthy"
  dimensions          = { Environment = var.environment }
  statistic           = "Minimum"
  period              = var.health_window_seconds
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  comparison_operator = "LessThanThreshold"
  threshold           = 1
  treat_missing_data  = "breaching"
  actions_enabled     = false
  tags                = var.tags
}

# Child alarm B — live payment requests are hitting Pay.gov transport errors.
resource "aws_cloudwatch_metric_alarm" "errors" {
  alarm_name          = "${var.name_prefix}-paygov-errors"
  alarm_description   = "Pay.gov transport/communication errors on live payment requests (>= ${var.error_alarm_threshold} in the health window). Child of ${var.name_prefix}-paygov-unhealthy-composite."
  namespace           = "USTC/PaymentPortal"
  metric_name         = "PayGovError"
  dimensions          = { Environment = var.environment }
  statistic           = "Sum"
  period              = var.health_window_seconds
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = var.error_alarm_threshold
  treat_missing_data  = "notBreaching"
  actions_enabled     = false
  tags                = var.tags
}

# Composite — Pay.gov is unhealthy if EITHER child trips.
resource "aws_cloudwatch_composite_alarm" "unhealthy" {
  alarm_name        = "${var.name_prefix}-paygov-unhealthy-composite"
  alarm_description = <<-EOT
    Pay.gov is unhealthy: the scheduled health probe is failing and/or live payment
    requests are hitting Pay.gov transport errors.
    Service: payment-portal (${var.environment})
    Severity: critical
    Health-probe alarm: ${aws_cloudwatch_metric_alarm.healthcheck_failed.alarm_name}
    Error-rate alarm:   ${aws_cloudwatch_metric_alarm.errors.alarm_name}
  EOT

  alarm_rule = "ALARM(\"${aws_cloudwatch_metric_alarm.healthcheck_failed.alarm_name}\") OR ALARM(\"${aws_cloudwatch_metric_alarm.errors.alarm_name}\")"

  actions_enabled = true
  alarm_actions   = var.alarm_sns_topic_arns
  ok_actions      = var.alarm_sns_topic_arns

  tags = var.tags
}
