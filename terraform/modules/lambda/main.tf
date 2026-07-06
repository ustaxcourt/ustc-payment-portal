locals {
  payment_flow_lambdas = toset(["initPayment", "processPayment", "getDetails"])

  lambda_functions = {
    # Payment-flow lambdas share var.payment_lambda_timeout (see variables.tf)
    # so the Pay.gov retry budget is tuned in one place.
    initPayment = {
      handler = "initPaymentHandler.initPaymentHandler"
      timeout = var.payment_lambda_timeout
    }
    processPayment = {
      handler = "processPaymentHandler.processPaymentHandler"
      timeout = var.payment_lambda_timeout
    }
    getDetails = {
      handler = "getDetailsHandler.getDetailsHandler"
      timeout = var.payment_lambda_timeout
    }
    testCert = {
      handler = "lambdaHandler.handler"
    }
    getAllTransactions = {
      handler = "getAllTransactionsHandler.getAllTransactionsHandler"
    }
    getTransactionsByStatus = {
      handler = "getTransactionsByStatusHandler.getTransactionsByStatusHandler"
    }
    getTransactionPaymentStatus = {
      handler = "getTransactionPaymentStatusHandler.getTransactionPaymentStatusHandler"
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
  publish = contains(local.payment_flow_lambdas, each.key)

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

resource "aws_lambda_alias" "payment_flow_live" {
  for_each = {
    for k, v in aws_lambda_function.functions : k => v
    if contains(local.payment_flow_lambdas, k)
  }

  name             = "live"
  function_name    = each.value.function_name
  function_version = each.value.version
}

resource "aws_lambda_provisioned_concurrency_config" "payment_flow" {
  for_each = var.payment_lambda_provisioned_concurrency > 0 ? aws_lambda_alias.payment_flow_live : {}

  function_name                     = each.value.function_name
  qualifier                         = each.value.name
  provisioned_concurrent_executions = var.payment_lambda_provisioned_concurrency
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
