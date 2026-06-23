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

resource "aws_cloudwatch_metric_alarm" "unhealthy" {
  alarm_name          = "${var.name_prefix}-paygov-unhealthy"
  alarm_description   = "Pay.gov WSDL probe reported unhealthy (no 2xx) for ~30 min, or stopped reporting."
  namespace           = "USTC/PaymentPortal"
  metric_name         = "PayGovHealthy"
  dimensions          = { Environment = var.environment }
  statistic           = "Maximum"
  period              = 900
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  comparison_operator = "LessThanThreshold"
  threshold           = 1
  treat_missing_data  = "breaching"
  alarm_actions       = var.alarm_sns_topic_arns
  ok_actions          = var.alarm_sns_topic_arns
  tags                = var.tags
}
