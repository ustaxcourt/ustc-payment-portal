mock_provider "aws" {}

run "core_topic_and_lambda_alarms" {
  command = plan

  variables {
    env         = "dev"
    name_prefix = "ustc-payment-portal-dev"
    subscribers = [
      { protocol = "email", endpoint = "oncall@example.gov" }
    ]
    lambda_functions = {
      initPayment    = "ustc-payment-portal-dev-initPayment"
      processPayment = "ustc-payment-portal-dev-processPayment"
    }
    lambda_log_group_names = {
      initPayment    = "/aws/lambda/ustc-payment-portal-dev-initPayment"
      processPayment = "/aws/lambda/ustc-payment-portal-dev-processPayment"
    }
  }

  assert {
    condition     = aws_sns_topic.alerts.name == "ustc-payment-portal-dev-alerts"
    error_message = "SNS topic name should follow name_prefix convention"
  }

  assert {
    condition     = length(aws_sns_topic_subscription.subs) == 1
    error_message = "one subscription should be created per subscriber"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.lambda_uncaught) == 2
    error_message = "one uncaught-error alarm should be created per lambda function"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.lambda_5xx) == 2
    error_message = "one 5xx alarm should be created per lambda log group"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.lambda_uncaught["initPayment"].dimensions.FunctionName == "ustc-payment-portal-dev-initPayment"
    error_message = "uncaught alarm FunctionName dimension should be the deployed function name (map value), not the key"
  }
}

run "teams_routing_disabled_when_vars_missing" {
  command = plan

  variables {
    env         = "dev"
    name_prefix = "ustc-payment-portal-dev"
  }

  assert {
    condition     = length(aws_iam_role.chatbot) == 0
    error_message = "chatbot role should not be created when Teams vars are unset"
  }

  assert {
    condition     = length(aws_chatbot_teams_channel_configuration.alerts) == 0
    error_message = "Teams channel config should not be created when Teams vars are unset"
  }
}

run "teams_routing_enabled_when_all_vars_set" {
  command = plan

  variables {
    env              = "prod"
    name_prefix      = "ustc-payment-portal-prod"
    teams_tenant_id  = "11111111-1111-1111-1111-111111111111"
    teams_team_id    = "22222222-2222-2222-2222-222222222222"
    teams_channel_id = "19:abc123@thread.tacv2"
  }

  assert {
    condition     = length(aws_iam_role.chatbot) == 1
    error_message = "chatbot role should be created when all Teams vars are set"
  }

  assert {
    condition     = length(aws_chatbot_teams_channel_configuration.alerts) == 1
    error_message = "Teams channel config should be created when all Teams vars are set"
  }

  assert {
    condition     = aws_chatbot_teams_channel_configuration.alerts[0].channel_id == "19%3Aabc123%40thread.tacv2"
    error_message = "channel_id must be URL-encoded for the Chatbot ChannelId pattern (: -> %3A, @ -> %40)"
  }
}

# Partial config (some Teams vars set, not all) must disable routing — enable_teams requires all three.
run "teams_routing_disabled_when_partially_configured" {
  command = plan

  variables {
    env             = "prod"
    name_prefix     = "ustc-payment-portal-prod"
    teams_tenant_id = "11111111-1111-1111-1111-111111111111"
    teams_team_id   = "22222222-2222-2222-2222-222222222222"
  }

  assert {
    condition     = length(aws_iam_role.chatbot) == 0
    error_message = "chatbot role should not be created when only some Teams vars are set"
  }

  assert {
    condition     = length(aws_chatbot_teams_channel_configuration.alerts) == 0
    error_message = "Teams channel config should not be created when only some Teams vars are set"
  }
}

run "proxy_alarms_gated_on_proxy_name" {
  command = plan

  variables {
    env         = "prod"
    name_prefix = "ustc-payment-portal-prod"
    proxy_name  = "ustc-payment-portal-prod-proxy"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.proxy_connections) == 1
    error_message = "proxy connections alarm should exist when proxy_name is set"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.proxy_availability) == 1
    error_message = "proxy availability alarm should exist when proxy_name is set"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.proxy_session_pinned) == 1
    error_message = "proxy session-pinned alarm should exist when proxy_name is set"
  }
}

run "api_gateway_429_alarm_gated_on_log_group" {
  command = plan

  variables {
    env         = "dev"
    name_prefix = "ustc-payment-portal-dev"
  }

  assert {
    condition     = length(aws_cloudwatch_log_metric_filter.api_gateway_429) == 0
    error_message = "429 metric filter should not exist without an access log group"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.api_gateway_429) == 0
    error_message = "429 alarm should not exist without an access log group"
  }
}

run "api_gateway_429_alarm_created_with_log_group" {
  command = plan

  variables {
    env                               = "prod"
    name_prefix                       = "ustc-payment-portal-prod"
    api_gateway_access_log_group_name = "/aws/apigateway/ustc-payment-portal-prod-access"
  }

  assert {
    condition     = length(aws_cloudwatch_log_metric_filter.api_gateway_429) == 1
    error_message = "429 metric filter should be created when an access log group is provided"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.api_gateway_429) == 1
    error_message = "429 alarm should be created when an access log group is provided"
  }
}
