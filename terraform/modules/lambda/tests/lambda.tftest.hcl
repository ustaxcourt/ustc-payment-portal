mock_provider "aws" {}

run "creates_expected_payment_functions" {
  command = plan

  variables {
    lambda_execution_role_arn = "arn:aws:iam::123456789012:role/lambda-exec"
    subnet_ids                = ["subnet-111111", "subnet-222222"]
    security_group_ids        = ["sg-111111"]
    artifact_bucket           = "ustc-payment-portal-build-artifacts"

    artifact_s3_keys = {
      initPayment     = "artifacts/dev/initPayment.zip"
      processPayment  = "artifacts/dev/processPayment.zip"
      getDetails      = "artifacts/dev/getDetails.zip"
      testCert        = "artifacts/dev/testCert.zip"
      migrationRunner = "artifacts/dev/migrationRunner.zip"
    }

    source_code_hashes = {
      initPayment     = "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU="
      processPayment  = "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU="
      getDetails      = "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU="
      testCert        = "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU="
      migrationRunner = "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU="
    }

    environment_variables_by_function = {
      initPayment     = { APP_ENV = "dev" }
      processPayment  = { APP_ENV = "dev" }
      getDetails      = { APP_ENV = "dev" }
      testCert        = { APP_ENV = "dev" }
      migrationRunner = { APP_ENV = "dev" }
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

  # migrationRunner is the only function that configures ephemeral storage, so it
  # is the sole exerciser of the dynamic "ephemeral_storage" block.
  assert {
    condition     = aws_lambda_function.functions["migrationRunner"].ephemeral_storage[0].size == 5120
    error_message = "migrationRunner should get 5120 MB ephemeral storage (needed to unpack/run migrations)"
  }

  assert {
    condition     = aws_lambda_function.functions["migrationRunner"].timeout == 120
    error_message = "migrationRunner should use its own 120s timeout, not the payment timeout or the provider default"
  }

  # Functions without an ephemeral_storage setting must not emit the block at all (AWS defaults them to 512 MB).
  assert {
    condition     = length(aws_lambda_function.functions["testCert"].ephemeral_storage) == 0
    error_message = "functions without an ephemeral_storage config should not declare the block"
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
