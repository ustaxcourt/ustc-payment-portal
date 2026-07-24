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

  # No lambda_memory_sizes was passed, so every function should fall back to the 128 MB default.
  assert {
    condition     = aws_lambda_function.functions["initPayment"].memory_size == 128
    error_message = "functions without a lambda_memory_sizes override should default to 128 MB"
  }

  assert {
    condition     = aws_lambda_function.functions["migrationRunner"].memory_size == 128
    error_message = "migrationRunner should also default to 128 MB when lambda_memory_sizes is not set"
  }
}

run "supports_custom_memory_sizes" {
  command = plan

  variables {
    lambda_execution_role_arn = "arn:aws:iam::123456789012:role/lambda-exec"
    subnet_ids                = ["subnet-111111", "subnet-222222"]
    security_group_ids        = ["sg-111111"]
    artifact_bucket           = "ustc-payment-portal-build-artifacts"

    # outputs.tf unconditionally indexes processPayment/getDetails/testCert, so
    # they must be present in every fixture even when this test isn't asserting on them.
    artifact_s3_keys = {
      initPayment        = "artifacts/dev/initPayment.zip"
      processPayment     = "artifacts/dev/processPayment.zip"
      getDetails         = "artifacts/dev/getDetails.zip"
      testCert           = "artifacts/dev/testCert.zip"
      getAllTransactions = "artifacts/dev/getAllTransactions.zip"
      migrationRunner    = "artifacts/dev/migrationRunner.zip"
    }

    source_code_hashes = {
      initPayment        = "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU="
      processPayment     = "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU="
      getDetails         = "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU="
      testCert           = "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU="
      getAllTransactions = "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU="
      migrationRunner    = "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU="
    }

    environment_variables_by_function = {
      initPayment        = { APP_ENV = "dev" }
      processPayment     = { APP_ENV = "dev" }
      getDetails         = { APP_ENV = "dev" }
      testCert           = { APP_ENV = "dev" }
      getAllTransactions = { APP_ENV = "dev" }
      migrationRunner    = { APP_ENV = "dev" }
    }

    # Mirrors the dev seeding: tuned fns at the 128 placeholder, dashboard fn fixed at 512,
    # migrationRunner fixed at 1024. getDetails/testCert are left unset to also exercise
    # the "falls back to 128 default while other functions are overridden" path.
    lambda_memory_sizes = {
      initPayment        = 128
      processPayment     = 256
      getAllTransactions = 512
      migrationRunner    = 1024
    }
  }

  assert {
    condition     = aws_lambda_function.functions["initPayment"].memory_size == 128
    error_message = "initPayment should use its explicit lambda_memory_sizes override"
  }

  assert {
    condition     = aws_lambda_function.functions["processPayment"].memory_size == 256
    error_message = "processPayment should use its explicit lambda_memory_sizes override"
  }

  assert {
    condition     = aws_lambda_function.functions["getDetails"].memory_size == 128
    error_message = "getDetails should fall back to the 128 MB default when omitted from lambda_memory_sizes, even while other functions are overridden"
  }

  assert {
    condition     = aws_lambda_function.functions["getAllTransactions"].memory_size == 512
    error_message = "getAllTransactions should use its fixed 512 MB override"
  }

  assert {
    condition     = aws_lambda_function.functions["migrationRunner"].memory_size == 1024
    error_message = "migrationRunner should use its fixed 1024 MB override"
  }
}

run "rejects_invalid_memory_size" {
  command = plan

  variables {
    lambda_execution_role_arn = "arn:aws:iam::123456789012:role/lambda-exec"
    subnet_ids                = ["subnet-111111", "subnet-222222"]
    security_group_ids        = ["sg-111111"]
    artifact_bucket           = "ustc-payment-portal-build-artifacts"

    artifact_s3_keys = {
      initPayment = "artifacts/dev/initPayment.zip"
    }

    source_code_hashes = {
      initPayment = "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU="
    }

    environment_variables_by_function = {
      initPayment = { APP_ENV = "dev" }
    }

    # Below AWS Lambda's 128 MB floor.
    lambda_memory_sizes = {
      initPayment = 64
    }
  }

  expect_failures = [var.lambda_memory_sizes]
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
