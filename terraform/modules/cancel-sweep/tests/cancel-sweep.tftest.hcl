mock_provider "aws" {}

variables {
  name_prefix                  = "ustc-payment-processor"
  environment                  = "dev"
  cancel_expired_function_name = "ustc-payment-processor-cancelExpired"
  cancel_expired_function_arn  = "arn:aws:lambda:us-east-1:123456789012:function:ustc-payment-processor-cancelExpired"
}

# Must match the `${prefix}-*` ARN patterns the CI IAM policies are scoped to.
run "names_follow_the_prefix_convention" {
  command = plan

  assert {
    condition     = aws_cloudwatch_event_rule.cancel_sweep.name == "ustc-payment-processor-cancel-sweep"
    error_message = "event rule name should be ${var.name_prefix}-cancel-sweep"
  }

  assert {
    condition     = startswith(aws_cloudwatch_metric_alarm.cancellation_spike.alarm_name, var.name_prefix)
    error_message = "spike alarm name should start with name_prefix"
  }

  assert {
    condition     = startswith(aws_cloudwatch_metric_alarm.sweep_failed.alarm_name, var.name_prefix)
    error_message = "failure alarm name should start with name_prefix"
  }
}

# The Lambda deploys dark; disabling the rule again is also the rollback.
run "schedule_ships_disabled_by_default" {
  command = plan

  assert {
    condition     = aws_cloudwatch_event_rule.cancel_sweep.state == "DISABLED"
    error_message = "schedule must default to DISABLED so the Lambda deploys dark"
  }

  assert {
    condition     = aws_cloudwatch_event_rule.cancel_sweep.schedule_expression == "rate(15 minutes)"
    error_message = "sweep should default to a 15-minute cadence"
  }
}

run "schedule_enables_when_asked" {
  command = plan

  variables {
    schedule_enabled = true
  }

  assert {
    condition     = aws_cloudwatch_event_rule.cancel_sweep.state == "ENABLED"
    error_message = "schedule_enabled = true should produce an ENABLED rule"
  }
}

run "invokes_the_supplied_lambda" {
  command = plan

  assert {
    condition     = aws_cloudwatch_event_target.cancel_sweep.arn == var.cancel_expired_function_arn
    error_message = "event target should invoke the provided cancelExpired Lambda ARN"
  }

  assert {
    condition     = aws_lambda_permission.allow_eventbridge.principal == "events.amazonaws.com"
    error_message = "lambda permission should allow the EventBridge principal"
  }

  assert {
    condition     = aws_lambda_permission.allow_eventbridge.function_name == var.cancel_expired_function_name
    error_message = "lambda permission should target the cancelExpired function"
  }
}

# Spike alarm reads our EMF counter, failure alarm reads Lambda's; neither breaches on missing.
run "alarms_watch_the_right_metrics" {
  command = plan

  variables {
    environment = "prod"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.cancellation_spike.namespace == "USTC/PaymentPortal"
    error_message = "spike alarm should read the portal's own EMF namespace"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.cancellation_spike.metric_name == "TransactionsCancelled"
    error_message = "spike alarm should read the TransactionsCancelled metric"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.cancellation_spike.dimensions["Environment"] == "prod"
    error_message = "spike alarm dimension must match the Lambda's APP_ENV or it matches no datapoints"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.sweep_failed.namespace == "AWS/Lambda"
    error_message = "failure alarm should read Lambda's own Errors metric"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.sweep_failed.dimensions["FunctionName"] == var.cancel_expired_function_name
    error_message = "failure alarm should be scoped to the cancelExpired function"
  }

  assert {
    condition = alltrue([
      aws_cloudwatch_metric_alarm.cancellation_spike.treat_missing_data == "notBreaching",
      aws_cloudwatch_metric_alarm.sweep_failed.treat_missing_data == "notBreaching",
    ])
    error_message = "neither alarm should treat missing data as breaching"
  }

  # The window must contain at least one sweep.
  assert {
    condition     = aws_cloudwatch_metric_alarm.cancellation_spike.period >= 900
    error_message = "spike window must exceed the 15-minute sweep cadence"
  }
}
