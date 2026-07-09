mock_provider "aws" {}

# Schedule + probe wiring: EventBridge invokes the testCert Lambda on cadence.
run "creates_schedule_and_probe_wiring" {
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

# Two child alarms (one per failure mode), both non-notifying — only the composite pages.
run "child_alarms_watch_correct_metrics_and_missing_data_policy" {
  command = plan

  variables {
    name_prefix            = "ustc-payment-processor"
    environment            = "stg"
    testcert_function_name = "ustc-payment-processor-testCert"
    testcert_function_arn  = "arn:aws:lambda:us-east-1:123456789012:function:ustc-payment-processor-testCert"
  }

  # Child A — the scheduled WSDL probe. Namespace must match what testCert publishes.
  assert {
    condition     = aws_cloudwatch_metric_alarm.healthcheck_failed.namespace == "USTC/PaymentPortal"
    error_message = "healthcheck alarm namespace must match what the testCert Lambda publishes"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.healthcheck_failed.metric_name == "PayGovHealthy"
    error_message = "healthcheck alarm should watch the PayGovHealthy metric"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.healthcheck_failed.dimensions["Environment"] == "stg"
    error_message = "healthcheck alarm Environment dimension should match the environment input"
  }

  # Missing probe data = breaching (silence is unhealthy).
  assert {
    condition     = aws_cloudwatch_metric_alarm.healthcheck_failed.treat_missing_data == "breaching"
    error_message = "missing probe data should be treated as breaching"
  }

  # Child B — live payment transport errors. Missing data = not breaching (opposite of the probe).
  assert {
    condition     = aws_cloudwatch_metric_alarm.errors.metric_name == "PayGovError"
    error_message = "error alarm should watch the PayGovError metric"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.errors.treat_missing_data == "notBreaching"
    error_message = "missing error data should be treated as not breaching"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.healthcheck_failed.period == var.health_window_seconds && aws_cloudwatch_metric_alarm.errors.period == var.health_window_seconds
    error_message = "both child alarms should evaluate over health_window_seconds"
  }

  # Children never notify directly — only the composite does.
  assert {
    condition     = aws_cloudwatch_metric_alarm.healthcheck_failed.actions_enabled == false && aws_cloudwatch_metric_alarm.errors.actions_enabled == false
    error_message = "child alarms must not fire actions; notification is owned by the composite"
  }
}

# Composite: unhealthy if EITHER child trips, and the sole notifier (where SNS is wired).
run "composite_ors_children_and_owns_notifications" {
  command = plan

  variables {
    name_prefix            = "ustc-payment-processor"
    environment            = "prod"
    testcert_function_name = "ustc-payment-processor-testCert"
    testcert_function_arn  = "arn:aws:lambda:us-east-1:123456789012:function:ustc-payment-processor-testCert"
    alarm_sns_topic_arns   = ["arn:aws:sns:us-east-1:123456789012:ustc-payment-processor-prod-alerts"]
  }

  assert {
    condition     = aws_cloudwatch_composite_alarm.unhealthy.alarm_name == "ustc-payment-processor-paygov-unhealthy-composite"
    error_message = "composite alarm name should follow name_prefix convention"
  }

  assert {
    condition     = aws_cloudwatch_composite_alarm.unhealthy.alarm_rule == "ALARM(\"ustc-payment-processor-paygov-healthcheck-failed\") OR ALARM(\"ustc-payment-processor-paygov-errors\")"
    error_message = "composite should fire when either child alarm (healthcheck OR errors) is in ALARM"
  }

  assert {
    condition     = aws_cloudwatch_composite_alarm.unhealthy.actions_enabled == true
    error_message = "composite alarm must have actions enabled — it is the notifier"
  }

  assert {
    condition     = contains(aws_cloudwatch_composite_alarm.unhealthy.alarm_actions, "arn:aws:sns:us-east-1:123456789012:ustc-payment-processor-prod-alerts")
    error_message = "composite alarm_actions should include the provided SNS topic"
  }

  assert {
    condition     = contains(aws_cloudwatch_composite_alarm.unhealthy.ok_actions, "arn:aws:sns:us-east-1:123456789012:ustc-payment-processor-prod-alerts")
    error_message = "composite ok_actions should include the provided SNS topic (recovery notification)"
  }
}

# With no SNS topics, the composite exists but notifies no one.
run "composite_actions_default_to_empty" {
  command = plan

  variables {
    name_prefix            = "ustc-payment-processor"
    environment            = "dev"
    testcert_function_name = "ustc-payment-processor-testCert"
    testcert_function_arn  = "arn:aws:lambda:us-east-1:123456789012:function:ustc-payment-processor-testCert"
  }

  assert {
    condition     = length(aws_cloudwatch_composite_alarm.unhealthy.alarm_actions) == 0
    error_message = "with no SNS topics provided, composite alarm_actions should be empty"
  }
}

# Guardrails (expect_failures).

# health_window_seconds must exceed the 15-min (900s) probe cadence.
run "rejects_health_window_at_or_below_probe_cadence" {
  command = plan

  variables {
    name_prefix            = "ustc-payment-processor"
    environment            = "dev"
    testcert_function_name = "ustc-payment-processor-testCert"
    testcert_function_arn  = "arn:aws:lambda:us-east-1:123456789012:function:ustc-payment-processor-testCert"
    health_window_seconds  = 900
  }

  expect_failures = [var.health_window_seconds]
}

# error_alarm_threshold must be a positive integer.
run "rejects_non_positive_error_threshold" {
  command = plan

  variables {
    name_prefix            = "ustc-payment-processor"
    environment            = "dev"
    testcert_function_name = "ustc-payment-processor-testCert"
    testcert_function_arn  = "arn:aws:lambda:us-east-1:123456789012:function:ustc-payment-processor-testCert"
    error_alarm_threshold  = 0
  }

  expect_failures = [var.error_alarm_threshold]
}
