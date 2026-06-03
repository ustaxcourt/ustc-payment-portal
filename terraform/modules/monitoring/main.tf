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

  enable_teams = (
    var.teams_tenant_id != null &&
    var.teams_team_id != null &&
    var.teams_channel_id != null
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

# Chatbot routes the SNS topic to a Teams channel. Inert until all teams_* vars set.
resource "aws_iam_role" "chatbot" {
  count = local.enable_teams ? 1 : 0

  name = "${var.name_prefix}-chatbot-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "chatbot.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = local.default_tags
}

resource "aws_iam_role_policy_attachment" "chatbot_cloudwatch_read" {
  count      = local.enable_teams ? 1 : 0
  role       = aws_iam_role.chatbot[0].name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchReadOnlyAccess"
}

resource "aws_chatbot_teams_channel_configuration" "alerts" {
  count = local.enable_teams ? 1 : 0

  configuration_name = "${var.name_prefix}-alerts"
  iam_role_arn       = aws_iam_role.chatbot[0].arn
  team_id            = var.teams_team_id
  tenant_id          = var.teams_tenant_id
  # AWS Chatbot's API rejects the raw "19:abc@thread.tacv2" form despite docs
  # listing it as valid — the URL-encoded form is what the server accepts.
  channel_id     = replace(replace(var.teams_channel_id, ":", "%3A"), "@", "%40")
  sns_topic_arns = [aws_sns_topic.alerts.arn]
  logging_level  = "ERROR"

  tags = local.default_tags
}
