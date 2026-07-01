mock_provider "aws" {}

run "creates_expected_payment_functions" {
  command = plan

  variables {
    lambda_execution_role_arn = "arn:aws:iam::123456789012:role/lambda-exec"
    subnet_ids                = ["subnet-111111", "subnet-222222"]
    security_group_ids        = ["sg-111111"]
    artifact_bucket           = "ustc-payment-portal-build-artifacts"

    artifact_s3_keys = {
      initPayment    = "artifacts/dev/initPayment.zip"
      processPayment = "artifacts/dev/processPayment.zip"
      getDetails     = "artifacts/dev/getDetails.zip"
      testCert       = "artifacts/dev/testCert.zip"
    }

    source_code_hashes = {
      initPayment    = "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU="
      processPayment = "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU="
      getDetails     = "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU="
      testCert       = "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU="
    }

    environment_variables_by_function = {
      initPayment    = { APP_ENV = "dev" }
      processPayment = { APP_ENV = "dev" }
      getDetails     = { APP_ENV = "dev" }
      testCert       = { APP_ENV = "dev" }
    }
  }

  assert {
    condition     = output.init_payment_function_name == "ustc-payment-processor-initPayment"
    error_message = "initPayment function name should use the default function_name_prefix"
  }

  assert {
    condition     = aws_lambda_function.functions["initPayment"].timeout == var.payment_lambda_timeout
    error_message = "payment-flow lambdas should use shared payment_lambda_timeout"
  }

  assert {
    condition     = aws_cloudwatch_log_group.lambda_logs["initPayment"].retention_in_days == var.log_retention_days
    error_message = "lambda log group retention should use log_retention_days"
  }
}

run "supports_custom_prefix_and_runtime" {
  command = plan

  variables {
    function_name_prefix      = "ustc-custom"
    runtime                   = "nodejs22.x"
    lambda_execution_role_arn = "arn:aws:iam::123456789012:role/lambda-exec"
    subnet_ids                = ["subnet-111111", "subnet-222222"]
    security_group_ids        = ["sg-111111"]
    artifact_bucket           = "ustc-payment-portal-build-artifacts"

    artifact_s3_keys = {
      initPayment    = "artifacts/dev/initPayment.zip"
      processPayment = "artifacts/dev/processPayment.zip"
      getDetails     = "artifacts/dev/getDetails.zip"
      testCert       = "artifacts/dev/testCert.zip"
    }

    source_code_hashes = {
      initPayment    = "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU="
      processPayment = "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU="
      getDetails     = "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU="
      testCert       = "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU="
    }

    environment_variables_by_function = {
      initPayment    = { APP_ENV = "dev" }
      processPayment = { APP_ENV = "dev" }
      getDetails     = { APP_ENV = "dev" }
      testCert       = { APP_ENV = "dev" }
    }
  }

  assert {
    condition     = output.process_payment_function_name == "ustc-custom-processPayment"
    error_message = "processPayment function should respect function_name_prefix override"
  }

  assert {
    condition     = aws_lambda_function.functions["processPayment"].runtime == "nodejs22.x"
    error_message = "runtime should match configured override"
  }
}
