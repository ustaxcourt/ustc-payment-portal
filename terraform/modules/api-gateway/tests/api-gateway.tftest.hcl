mock_provider "aws" {}

run "non_dev_environment_skips_dashboard_routes" {
  command = plan

  variables {
    environment = "stg"
    stage_name  = "stg"
    lambda_function_arns = {
      initPayment    = "arn:aws:lambda:us-east-1:123456789012:function:init"
      processPayment = "arn:aws:lambda:us-east-1:123456789012:function:process"
      getDetails     = "arn:aws:lambda:us-east-1:123456789012:function:details"
      testCert       = "arn:aws:lambda:us-east-1:123456789012:function:test"
      healthCheck    = "arn:aws:lambda:us-east-1:123456789012:function:health"
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
    condition     = length(aws_api_gateway_method.transactions_get) == 0
    error_message = "dashboard routes should not exist in non-dev environments"
  }
}

run "dev_environment_enables_dashboard_routes" {
  command = plan

  variables {
    environment              = "dev"
    stage_name               = "dev"
    enable_public_dashboard  = true
    dashboard_allowed_origin = "https://dashboard.dev-payments.ustaxcourt.gov"
    lambda_function_arns = {
      initPayment                 = "arn:aws:lambda:us-east-1:123456789012:function:init"
      processPayment              = "arn:aws:lambda:us-east-1:123456789012:function:process"
      getDetails                  = "arn:aws:lambda:us-east-1:123456789012:function:details"
      testCert                    = "arn:aws:lambda:us-east-1:123456789012:function:test"
      healthCheck                 = "arn:aws:lambda:us-east-1:123456789012:function:health"
      getAllTransactions          = "arn:aws:lambda:us-east-1:123456789012:function:get-all"
      getTransactionsByStatus     = "arn:aws:lambda:us-east-1:123456789012:function:get-by-status"
      getTransactionPaymentStatus = "arn:aws:lambda:us-east-1:123456789012:function:get-payment-status"
    }
  }

  assert {
    condition     = length(aws_api_gateway_method.transactions_get) == 1
    error_message = "dashboard GET /transactions route should exist in dev"
  }

  assert {
    condition     = aws_api_gateway_method.transactions_get[0].authorization == "NONE"
    error_message = "dashboard GET method should not require IAM auth; public access is granted via the resource policy"
  }

  assert {
    condition     = length(local.public_dashboard_resource_arns) == 6
    error_message = "enable_public_dashboard=true should add the anonymous dashboard paths to the resource policy"
  }
}

# dev + enable_public_dashboard=false: routes still exist (env-gated), but the
# anonymous resource-policy statement must NOT be added.
run "dev_routes_stay_private_without_public_dashboard_flag" {
  command = plan

  variables {
    environment = "dev"
    stage_name  = "dev"
    lambda_function_arns = {
      initPayment                 = "arn:aws:lambda:us-east-1:123456789012:function:init"
      processPayment              = "arn:aws:lambda:us-east-1:123456789012:function:process"
      getDetails                  = "arn:aws:lambda:us-east-1:123456789012:function:details"
      testCert                    = "arn:aws:lambda:us-east-1:123456789012:function:test"
      healthCheck                 = "arn:aws:lambda:us-east-1:123456789012:function:health"
      getAllTransactions          = "arn:aws:lambda:us-east-1:123456789012:function:get-all"
      getTransactionsByStatus     = "arn:aws:lambda:us-east-1:123456789012:function:get-by-status"
      getTransactionPaymentStatus = "arn:aws:lambda:us-east-1:123456789012:function:get-payment-status"
    }
  }

  assert {
    condition     = length(aws_api_gateway_method.transactions_get) == 1
    error_message = "dashboard routes are env-gated, so they still exist in dev with the flag off"
  }

  assert {
    condition     = length(local.public_dashboard_resource_arns) == 0
    error_message = "enable_public_dashboard=false must add no anonymous statement to the resource policy"
  }
}

run "rejects_invalid_log_retention_days" {
  command = plan

  variables {
    environment        = "stg"
    stage_name         = "stg"
    log_retention_days = 2
    lambda_function_arns = {
      initPayment    = "arn:aws:lambda:us-east-1:123456789012:function:init"
      processPayment = "arn:aws:lambda:us-east-1:123456789012:function:process"
      getDetails     = "arn:aws:lambda:us-east-1:123456789012:function:details"
      testCert       = "arn:aws:lambda:us-east-1:123456789012:function:test"
      healthCheck    = "arn:aws:lambda:us-east-1:123456789012:function:health"
    }
  }

  expect_failures = [var.log_retention_days]
}
