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
    getAllTransactions = {
      handler = "lambdaHandler.getAllTransactionsHandler"
    }
    getTransactionsByStatus = {
      handler = "lambdaHandler.getTransactionsByStatusHandler"
    }
    getTransactionPaymentStatus = {
      handler = "lambdaHandler.getTransactionPaymentStatusHandler"
    }
    migrationRunner = {
      handler           = "lambdaHandler.migrationHandler"
      timeout           = 120
      ephemeral_storage = 5120
    }
  }
}

resource "aws_lambda_function" "functions" {
  for_each = var.artifact_s3_keys

  s3_bucket        = var.artifact_bucket
  s3_key           = each.value
  source_code_hash = var.source_code_hashes[each.key]

  function_name = "${var.function_name_prefix}-${each.key}"
  role          = var.lambda_execution_role_arn
  handler       = local.lambda_functions[each.key].handler

  timeout = try(local.lambda_functions[each.key].timeout, null)

  runtime = var.runtime

  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = var.security_group_ids
  }

  dynamic "ephemeral_storage" {
    for_each = try(local.lambda_functions[each.key].ephemeral_storage, null) != null ? [1] : []
    content {
      size = local.lambda_functions[each.key].ephemeral_storage
    }
  }

  environment {
    variables = var.environment_variables_by_function[each.key]
  }

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "lambda_logs" {
  for_each          = var.artifact_s3_keys
  name              = "/aws/lambda/${var.function_name_prefix}-${each.key}"
  retention_in_days = var.log_retention_days
  tags              = var.tags

  lifecycle {
    create_before_destroy = true
  }
}
