mock_provider "aws" {}

run "creates_schedule_and_alarm_with_prefix" {
  command = plan

  variables {
    name_prefix            = "ustc-payment-processor"
    environment            = "dev"
    testcert_function_name = "ustc-payment-processor-testCert"
    testcert_function_arn  = "arn:aws:lambda:us-east-1:123456789012:function:ustc-payment-processor-testCert"
  }

  assert {
    condition     = aws_cloudwatch_event_rule.health.name == "ustc-payment-processor-paygov-health"
    error_message = "event rule name should follow name_prefix convention"
  }

  assert {
    condition     = aws_cloudwatch_event_rule.health.schedule_expression == "rate(15 minutes)"
    error_message = "probe should run on a 15-minute cadence"
  }

  assert {
    condition     = aws_cloudwatch_event_target.health.arn == var.testcert_function_arn
    error_message = "event target should invoke the provided testCert Lambda ARN"
  }

  assert {
    condition     = aws_lambda_permission.allow_eventbridge.principal == "events.amazonaws.com"
    error_message = "lambda permission should allow the EventBridge principal"
  }
}

run "alarm_wired_to_environment_dimension_and_metric" {
  command = plan

  variables {
    name_prefix            = "ustc-payment-processor"
    environment            = "stg"
    testcert_function_name = "ustc-payment-processor-testCert"
    testcert_function_arn  = "arn:aws:lambda:us-east-1:123456789012:function:ustc-payment-processor-testCert"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.unhealthy.namespace == "USTC/PaymentPortal"
    error_message = "alarm namespace must match the namespace the testCert Lambda publishes to, or the alarm never sees data"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.unhealthy.metric_name == "PayGovHealthy"
    error_message = "alarm should watch the PayGovHealthy metric"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.unhealthy.dimensions["Environment"] == "stg"
    error_message = "alarm Environment dimension should match the environment input"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.unhealthy.treat_missing_data == "breaching"
    error_message = "missing probe data should be treated as breaching (fail-sensitive)"
  }
}

run "alarm_actions_default_to_empty" {
  command = plan

  variables {
    name_prefix            = "ustc-payment-processor"
    environment            = "dev"
    testcert_function_name = "ustc-payment-processor-testCert"
    testcert_function_arn  = "arn:aws:lambda:us-east-1:123456789012:function:ustc-payment-processor-testCert"
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.unhealthy.alarm_actions) == 0
    error_message = "with no SNS topics provided, alarm_actions should be empty"
  }
}
