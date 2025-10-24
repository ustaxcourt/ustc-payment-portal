locals {
  lambda_functions = {
    initPayment = {
      handler = "lambdaHandler.initPaymentHandler"
    }
    processPayment = {
      handler = "lambdaHandler.processPaymentHandler"
    }
    getDetails = {
      handler = "lambdaHandler.getDetailsHandler"
    }
    testCert = {
      handler = "lambdaHandler.handler"
    }
  }
}

resource "aws_lambda_function" "functions" {
  for_each = local.lambda_functions

  s3_bucket        = var.artifact_bucket
  s3_key           = var.artifact_s3_keys[each.key]
  source_code_hash = var.source_code_hashes[each.key]

  function_name = "${var.function_name_prefix}-${each.key}"
  role          = var.lambda_execution_role_arn
  handler       = each.value.handler

  runtime = var.runtime

  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = var.security_group_ids
  }

  # Increase /tmp storage to 5GB
  ephemeral_storage {
    size = 5120
  }

  environment {
    variables = var.environment_variables
  }

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "lambda_logs" {
  for_each          = local.lambda_functions
  name              = "/aws/lambda/${var.function_name_prefix}-${each.key}"
  retention_in_days = var.log_retention_days
  tags              = var.tags

  lifecycle {
    create_before_destroy = true
  }
}
