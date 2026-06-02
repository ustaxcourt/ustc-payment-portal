locals {
  default_tags = merge(
    {
      Env     = var.env
      Service = var.service_name
      Owner   = var.owner
      Project = "ustc-payment-portal"
    },
    var.tags,
  )
}

resource "aws_sns_topic" "alerts" {
  name = "${var.name_prefix}-alerts"

  tags = local.default_tags
}

# Keyed by protocol+endpoint so individual edits don't recreate the whole set.
resource "aws_sns_topic_subscription" "subs" {
  for_each = {
    for s in var.subscribers : "${s.protocol}-${s.endpoint}" => s
  }

  topic_arn = aws_sns_topic.alerts.arn
  protocol  = each.value.protocol
  endpoint  = each.value.endpoint
}

# Catches runtime errors that escape handleError (handler crash, OOM, init failure).
resource "aws_cloudwatch_metric_alarm" "lambda_uncaught" {
  for_each = var.lambda_functions

  alarm_name          = "${var.name_prefix}-${each.key}-uncaught-critical"
  alarm_description   = "Uncaught Lambda error in ${each.key}. Runbook: ${var.runbook_url}"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  period              = 1800
  threshold           = 1
  statistic           = "Sum"
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = each.value
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = merge(local.default_tags, {
    Severity = "critical"
    Metric   = "uncaught"
    Lambda   = each.key
    Runbook  = var.runbook_url
  })
}

# 5xx responses go through handleError (return, not throw), so AWS/Lambda Errors stays
# zero — we filter logs at level=error instead. See docs/runbooks/lambda-error-alerts.md.
resource "aws_cloudwatch_log_metric_filter" "lambda_5xx" {
  for_each = var.lambda_log_group_names

  name           = "${var.name_prefix}-${each.key}-5xx"
  log_group_name = each.value
  pattern        = "{ $.level = \"error\" }"

  metric_transformation {
    namespace     = "${var.name_prefix}/errors"
    name          = "${each.key}-5xx"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "lambda_5xx" {
  for_each = var.lambda_log_group_names

  alarm_name          = "${var.name_prefix}-${each.key}-5xx-critical"
  alarm_description   = "5xx response from ${each.key}. Runbook: ${var.runbook_url}"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  period              = 1800
  threshold           = 1
  statistic           = "Sum"
  metric_name         = "${each.key}-5xx"
  namespace           = "${var.name_prefix}/errors"
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = merge(local.default_tags, {
    Severity = "critical"
    Metric   = "5xx"
    Lambda   = each.key
    Runbook  = var.runbook_url
  })

  depends_on = [aws_cloudwatch_log_metric_filter.lambda_5xx]
}
