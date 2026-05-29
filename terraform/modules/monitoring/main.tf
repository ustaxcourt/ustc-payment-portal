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

# SNS topic that all alarms publish to. Subscribers come from var.subscribers
# (read by the caller from Secrets Manager). Additional subscribers can be
# added at runtime via console/CLI without redeploying — satisfies the
# "subscribable without a deployment" AC.
resource "aws_sns_topic" "alerts" {
  name = "${var.name_prefix}-alerts"

  tags = local.default_tags
}

# Subscriptions keyed by protocol+endpoint so adding/removing one doesn't
# force-recreate the others.
resource "aws_sns_topic_subscription" "subs" {
  for_each = {
    for s in var.subscribers : "${s.protocol}-${s.endpoint}" => s
  }

  topic_arn = aws_sns_topic.alerts.arn
  protocol  = each.value.protocol
  endpoint  = each.value.endpoint
}

# Alarm on AWS/Lambda Errors (uncaught exceptions that escape the handler).
# Note: in this codebase handleError catches almost everything and returns a
# 500 response, so this metric will rarely fire on its own. The Phase 3
# log-based metric filter is the primary detection path; this alarm catches
# the rare cases where something genuinely throws.
#
# Window: 30 min (1 evaluation period x 1800s) per ticket AC.
# treat_missing_data="notBreaching": quiet periods are healthy, not unknown.
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
