# Scheduled Pay.gov health probe.
#
# An EventBridge rule invokes the existing testCert Lambda on a fixed cadence.
# Each invocation probes Pay.gov's WSDL and publishes a `PayGovHealthy` metric
# (CloudWatch EMF). The alarm below turns that metric into the durable
# "is Pay.gov healthy?" signal that drives outage alerting and dashboards.

resource "aws_cloudwatch_event_rule" "health" {
  name                = "${var.name_prefix}-paygov-health"
  description         = "Periodic Pay.gov health probe (invokes the testCert Lambda)"
  schedule_expression = var.schedule_expression
  tags                = var.tags
}

resource "aws_cloudwatch_event_target" "health" {
  rule      = aws_cloudwatch_event_rule.health.name
  target_id = "testCert"
  arn       = var.testcert_function_arn
}

resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowEventBridgePayGovHealth"
  action        = "lambda:InvokeFunction"
  function_name = var.testcert_function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.health.arn
}

# Alarm semantics: PayGovHealthy is 1 (healthy) or 0 (unhealthy) per probe.
# `Maximum < 1` over a 15-min period means *no* successful probe in that window;
# requiring 2 consecutive periods (~30 min) avoids flapping on a transient blip
# while still catching a real outage. `treat_missing_data = breaching` so a probe
# that stops reporting (broken Lambda/schedule) also alarms — "we can't confirm
# Pay.gov" is itself actionable for a sysadmin.
resource "aws_cloudwatch_metric_alarm" "unhealthy" {
  alarm_name          = "${var.name_prefix}-paygov-unhealthy"
  alarm_description   = "Pay.gov WSDL probe reported unhealthy (no 2xx) for ~30 min, or stopped reporting."
  namespace           = "USTC/PaymentPortal"
  metric_name         = "PayGovHealthy"
  dimensions          = { Environment = var.environment }
  statistic           = "Maximum"
  period              = 900
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  comparison_operator = "LessThanThreshold"
  threshold           = 1
  treat_missing_data  = "breaching"
  alarm_actions       = var.alarm_sns_topic_arns
  ok_actions          = var.alarm_sns_topic_arns
  tags                = var.tags
}
