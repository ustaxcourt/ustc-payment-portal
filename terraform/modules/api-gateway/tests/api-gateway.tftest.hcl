mock_provider "aws" {}

# Every environment deploys only the SigV4 dashboard routes; the lambda_function_arns
# map carries no anonymous-route Lambdas, so indexing them would fail the plan.
run "stg_environment_enables_only_sigv4_dashboard_routes" {
  command = plan

  variables {
    environment              = "stg"
    stage_name               = "stg"
    dashboard_allowed_origin = "https://stg-dashboard.payments.ustaxcourt.gov"
    lambda_function_arns = {
      initPayment       = "arn:aws:lambda:us-east-1:123456789012:function:init"
      processPayment    = "arn:aws:lambda:us-east-1:123456789012:function:process"
      getDetails        = "arn:aws:lambda:us-east-1:123456789012:function:details"
      testCert          = "arn:aws:lambda:us-east-1:123456789012:function:test"
      healthCheck       = "arn:aws:lambda:us-east-1:123456789012:function:health"
      validateClient    = "arn:aws:lambda:us-east-1:123456789012:function:validate-client"
      getTransactionLog = "arn:aws:lambda:us-east-1:123456789012:function:get-transaction-log"
      getRevenueSummary = "arn:aws:lambda:us-east-1:123456789012:function:get-revenue-summary"
    }
  }

  assert {
    condition     = output.stage_name == "stg"
    error_message = "stage_name output should match configured stage"
  }

  assert {
    condition     = output.custom_domain_url == null
    error_message = "custom_domain_url should be null when custom_domain is empty"
  }

  assert {
    condition     = aws_api_gateway_method.transaction_log_get.authorization == "AWS_IAM" && aws_api_gateway_method.revenue_summary_get.authorization == "AWS_IAM"
    error_message = "the dashboard routes must exist in stg and require SigV4"
  }
}

run "dev_environment_enables_only_sigv4_dashboard_routes" {
  command = plan

  variables {
    environment              = "dev"
    stage_name               = "dev"
    dashboard_allowed_origin = "https://dashboard.dev-payments.ustaxcourt.gov"
    lambda_function_arns = {
      initPayment       = "arn:aws:lambda:us-east-1:123456789012:function:init"
      processPayment    = "arn:aws:lambda:us-east-1:123456789012:function:process"
      getDetails        = "arn:aws:lambda:us-east-1:123456789012:function:details"
      testCert          = "arn:aws:lambda:us-east-1:123456789012:function:test"
      healthCheck       = "arn:aws:lambda:us-east-1:123456789012:function:health"
      validateClient    = "arn:aws:lambda:us-east-1:123456789012:function:validate-client"
      getTransactionLog = "arn:aws:lambda:us-east-1:123456789012:function:get-transaction-log"
      getRevenueSummary = "arn:aws:lambda:us-east-1:123456789012:function:get-revenue-summary"
    }
  }

  assert {
    condition     = aws_api_gateway_method.transaction_log_get.authorization == "AWS_IAM" && aws_api_gateway_method.revenue_summary_get.authorization == "AWS_IAM"
    error_message = "the dashboard routes must exist in dev and require SigV4"
  }
}

run "prod_environment_enables_only_sigv4_dashboard_routes" {
  command = plan

  variables {
    environment = "prod"
    stage_name  = "prod"
    lambda_function_arns = {
      initPayment       = "arn:aws:lambda:us-east-1:123456789012:function:init"
      processPayment    = "arn:aws:lambda:us-east-1:123456789012:function:process"
      getDetails        = "arn:aws:lambda:us-east-1:123456789012:function:details"
      testCert          = "arn:aws:lambda:us-east-1:123456789012:function:test"
      healthCheck       = "arn:aws:lambda:us-east-1:123456789012:function:health"
      validateClient    = "arn:aws:lambda:us-east-1:123456789012:function:validate-client"
      getTransactionLog = "arn:aws:lambda:us-east-1:123456789012:function:get-transaction-log"
      getRevenueSummary = "arn:aws:lambda:us-east-1:123456789012:function:get-revenue-summary"
    }
  }

  assert {
    condition     = aws_api_gateway_method.transaction_log_get.authorization == "AWS_IAM" && aws_api_gateway_method.revenue_summary_get.authorization == "AWS_IAM"
    error_message = "the dashboard routes must exist in prod and require SigV4"
  }
}

run "rejects_invalid_log_retention_days" {
  command = plan

  variables {
    environment        = "stg"
    stage_name         = "stg"
    log_retention_days = 2
    lambda_function_arns = {
      initPayment       = "arn:aws:lambda:us-east-1:123456789012:function:init"
      processPayment    = "arn:aws:lambda:us-east-1:123456789012:function:process"
      getDetails        = "arn:aws:lambda:us-east-1:123456789012:function:details"
      testCert          = "arn:aws:lambda:us-east-1:123456789012:function:test"
      healthCheck       = "arn:aws:lambda:us-east-1:123456789012:function:health"
      validateClient    = "arn:aws:lambda:us-east-1:123456789012:function:validate-client"
      getTransactionLog = "arn:aws:lambda:us-east-1:123456789012:function:get-transaction-log"
      getRevenueSummary = "arn:aws:lambda:us-east-1:123456789012:function:get-revenue-summary"
    }
  }

  expect_failures = [var.log_retention_days]
}
