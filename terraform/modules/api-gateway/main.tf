###############################
# Dashboard endpoints (dev only)
###############################
locals {
  enable_dashboard_endpoints = var.environment == "dev" || startswith(var.environment, "pr-")
}

resource "aws_api_gateway_resource" "transactions" {
  count       = local.enable_dashboard_endpoints ? 1 : 0
  rest_api_id = aws_api_gateway_rest_api.rest.id
  parent_id   = aws_api_gateway_rest_api.rest.root_resource_id
  path_part   = "transactions"
}

resource "aws_api_gateway_resource" "transactions_by_status" {
  count       = local.enable_dashboard_endpoints ? 1 : 0
  rest_api_id = aws_api_gateway_rest_api.rest.id
  parent_id   = aws_api_gateway_resource.transactions[0].id
  path_part   = "{paymentStatus}"
}

resource "aws_api_gateway_resource" "transaction_payment_status" {
  count       = local.enable_dashboard_endpoints ? 1 : 0
  rest_api_id = aws_api_gateway_rest_api.rest.id
  parent_id   = aws_api_gateway_rest_api.rest.root_resource_id
  path_part   = "transaction-payment-status"
}

###################
# GET Methods
###################

resource "aws_api_gateway_method" "transactions_get" {
  count         = local.enable_dashboard_endpoints ? 1 : 0
  rest_api_id   = aws_api_gateway_rest_api.rest.id
  resource_id   = aws_api_gateway_resource.transactions[0].id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "transactions_by_status_get" {
  count         = local.enable_dashboard_endpoints ? 1 : 0
  rest_api_id   = aws_api_gateway_rest_api.rest.id
  resource_id   = aws_api_gateway_resource.transactions_by_status[0].id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "transaction_payment_status_get" {
  count         = local.enable_dashboard_endpoints ? 1 : 0
  rest_api_id   = aws_api_gateway_rest_api.rest.id
  resource_id   = aws_api_gateway_resource.transaction_payment_status[0].id
  http_method   = "GET"
  authorization = "NONE"
}

###################
# Integrations
###################

resource "aws_api_gateway_integration" "transactions_integration" {
  count                   = local.enable_dashboard_endpoints ? 1 : 0
  rest_api_id             = aws_api_gateway_rest_api.rest.id
  resource_id             = aws_api_gateway_resource.transactions[0].id
  http_method             = aws_api_gateway_method.transactions_get[0].http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = "arn:aws:apigateway:${data.aws_region.current.name}:lambda:path/2015-03-31/functions/${var.lambda_function_arns["getAllTransactions"]}/invocations"
}

resource "aws_api_gateway_integration" "transactions_by_status_integration" {
  count                   = local.enable_dashboard_endpoints ? 1 : 0
  rest_api_id             = aws_api_gateway_rest_api.rest.id
  resource_id             = aws_api_gateway_resource.transactions_by_status[0].id
  http_method             = aws_api_gateway_method.transactions_by_status_get[0].http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = "arn:aws:apigateway:${data.aws_region.current.name}:lambda:path/2015-03-31/functions/${var.lambda_function_arns["getTransactionsByStatus"]}/invocations"
}

resource "aws_api_gateway_integration" "transaction_payment_status_integration" {
  count                   = local.enable_dashboard_endpoints ? 1 : 0
  rest_api_id             = aws_api_gateway_rest_api.rest.id
  resource_id             = aws_api_gateway_resource.transaction_payment_status[0].id
  http_method             = aws_api_gateway_method.transaction_payment_status_get[0].http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = "arn:aws:apigateway:${data.aws_region.current.name}:lambda:path/2015-03-31/functions/${var.lambda_function_arns["getTransactionPaymentStatus"]}/invocations"
}

###################
# OPTIONS (CORS)
###################

# transactions
resource "aws_api_gateway_method" "transactions_options" {
  count         = local.enable_dashboard_endpoints ? 1 : 0
  rest_api_id   = aws_api_gateway_rest_api.rest.id
  resource_id   = aws_api_gateway_resource.transactions[0].id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "transactions_options_integration" {
  count             = local.enable_dashboard_endpoints ? 1 : 0
  rest_api_id       = aws_api_gateway_rest_api.rest.id
  resource_id       = aws_api_gateway_resource.transactions[0].id
  http_method       = aws_api_gateway_method.transactions_options[0].http_method
  type              = "MOCK"
  request_templates = { "application/json" = "{\"statusCode\": 200}" }
}

resource "aws_api_gateway_method_response" "transactions_options_200" {
  count       = local.enable_dashboard_endpoints ? 1 : 0
  rest_api_id = aws_api_gateway_rest_api.rest.id
  resource_id = aws_api_gateway_resource.transactions[0].id
  http_method = aws_api_gateway_method.transactions_options[0].http_method
  status_code = "200"
  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Headers" = true
  }
}

resource "aws_api_gateway_integration_response" "transactions_options_response" {
  count       = local.enable_dashboard_endpoints ? 1 : 0
  rest_api_id = aws_api_gateway_rest_api.rest.id
  resource_id = aws_api_gateway_resource.transactions[0].id
  http_method = aws_api_gateway_method.transactions_options[0].http_method
  status_code = aws_api_gateway_method_response.transactions_options_200[0].status_code
  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = "'${var.dashboard_allowed_origin}'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type'"
  }
}

# transactions_by_status
resource "aws_api_gateway_method" "transactions_by_status_options" {
  count         = local.enable_dashboard_endpoints ? 1 : 0
  rest_api_id   = aws_api_gateway_rest_api.rest.id
  resource_id   = aws_api_gateway_resource.transactions_by_status[0].id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "transactions_by_status_options_integration" {
  count             = local.enable_dashboard_endpoints ? 1 : 0
  rest_api_id       = aws_api_gateway_rest_api.rest.id
  resource_id       = aws_api_gateway_resource.transactions_by_status[0].id
  http_method       = aws_api_gateway_method.transactions_by_status_options[0].http_method
  type              = "MOCK"
  request_templates = { "application/json" = "{\"statusCode\": 200}" }
}

resource "aws_api_gateway_method_response" "transactions_by_status_options_200" {
  count       = local.enable_dashboard_endpoints ? 1 : 0
  rest_api_id = aws_api_gateway_rest_api.rest.id
  resource_id = aws_api_gateway_resource.transactions_by_status[0].id
  http_method = aws_api_gateway_method.transactions_by_status_options[0].http_method
  status_code = "200"
}

resource "aws_api_gateway_integration_response" "transactions_by_status_options_response" {
  count       = local.enable_dashboard_endpoints ? 1 : 0
  rest_api_id = aws_api_gateway_rest_api.rest.id
  resource_id = aws_api_gateway_resource.transactions_by_status[0].id
  http_method = aws_api_gateway_method.transactions_by_status_options[0].http_method
  status_code = aws_api_gateway_method_response.transactions_by_status_options_200[0].status_code
}

# transaction_payment_status
resource "aws_api_gateway_method" "transaction_payment_status_options" {
  count         = local.enable_dashboard_endpoints ? 1 : 0
  rest_api_id   = aws_api_gateway_rest_api.rest.id
  resource_id   = aws_api_gateway_resource.transaction_payment_status[0].id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "transaction_payment_status_options_integration" {
  count             = local.enable_dashboard_endpoints ? 1 : 0
  rest_api_id       = aws_api_gateway_rest_api.rest.id
  resource_id       = aws_api_gateway_resource.transaction_payment_status[0].id
  http_method       = aws_api_gateway_method.transaction_payment_status_options[0].http_method
  type              = "MOCK"
  request_templates = { "application/json" = "{\"statusCode\": 200}" }
}

resource "aws_api_gateway_method_response" "transaction_payment_status_options_200" {
  count       = local.enable_dashboard_endpoints ? 1 : 0
  rest_api_id = aws_api_gateway_rest_api.rest.id
  resource_id = aws_api_gateway_resource.transaction_payment_status[0].id
  http_method = aws_api_gateway_method.transaction_payment_status_options[0].http_method
  status_code = "200"
}

resource "aws_api_gateway_integration_response" "transaction_payment_status_options_response" {
  count       = local.enable_dashboard_endpoints ? 1 : 0
  rest_api_id = aws_api_gateway_rest_api.rest.id
  resource_id = aws_api_gateway_resource.transaction_payment_status[0].id
  http_method = aws_api_gateway_method.transaction_payment_status_options[0].http_method
  status_code = aws_api_gateway_method_response.transaction_payment_status_options_200[0].status_code
}

###################
# Lambda Permissions
###################

resource "aws_lambda_permission" "transactions_permission" {
  count         = local.enable_dashboard_endpoints ? 1 : 0
  statement_id  = "AllowAPIGatewayInvokeTransactions"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_function_arns["getAllTransactions"]
  principal     = "apigateway.amazonaws.com"
}

resource "aws_lambda_permission" "transactions_by_status_permission" {
  count         = local.enable_dashboard_endpoints ? 1 : 0
  statement_id  = "AllowAPIGatewayInvokeTransactionsByStatus"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_function_arns["getTransactionsByStatus"]
  principal     = "apigateway.amazonaws.com"
}

resource "aws_lambda_permission" "transaction_payment_status_permission" {
  count         = local.enable_dashboard_endpoints ? 1 : 0
  statement_id  = "AllowAPIGatewayInvokeTransactionPaymentStatus"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_function_arns["getTransactionPaymentStatus"]
  principal     = "apigateway.amazonaws.com"
}
data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

# API Gateway REST API
resource "aws_api_gateway_rest_api" "rest" {
  name        = "ustc-payment-portal-${var.environment}-api-gateway"
  description = "USTC Payment Payment Portal"

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  tags = var.common_tags
}

#POST /init
resource "aws_api_gateway_resource" "init" {
  rest_api_id = aws_api_gateway_rest_api.rest.id
  parent_id   = aws_api_gateway_rest_api.rest.root_resource_id
  path_part   = "init"
}

#POST /process
resource "aws_api_gateway_resource" "process" {
  rest_api_id = aws_api_gateway_rest_api.rest.id
  parent_id   = aws_api_gateway_rest_api.rest.root_resource_id
  path_part   = "process"
}

resource "aws_api_gateway_resource" "test" {
  rest_api_id = aws_api_gateway_rest_api.rest.id
  parent_id   = aws_api_gateway_rest_api.rest.root_resource_id
  path_part   = "test"
}

#GET /details/{transactionReferenceId}
resource "aws_api_gateway_resource" "details" {
  rest_api_id = aws_api_gateway_rest_api.rest.id
  parent_id   = aws_api_gateway_rest_api.rest.root_resource_id
  path_part   = "details"
}

resource "aws_api_gateway_resource" "details_tracking" {
  rest_api_id = aws_api_gateway_rest_api.rest.id
  parent_id   = aws_api_gateway_resource.details.id
  path_part   = "{transactionReferenceId}"
}

#Methods
resource "aws_api_gateway_method" "init_post" {
  rest_api_id   = aws_api_gateway_rest_api.rest.id
  resource_id   = aws_api_gateway_resource.init.id
  http_method   = "POST"
  authorization = "AWS_IAM"
}

resource "aws_api_gateway_method" "process_post" {
  rest_api_id   = aws_api_gateway_rest_api.rest.id
  resource_id   = aws_api_gateway_resource.process.id
  http_method   = "POST"
  authorization = "AWS_IAM"
}

resource "aws_api_gateway_method" "test_get" {
  rest_api_id   = aws_api_gateway_rest_api.rest.id
  resource_id   = aws_api_gateway_resource.test.id
  http_method   = "GET"
  authorization = "AWS_IAM"
}

resource "aws_api_gateway_method" "details_get" {
  rest_api_id   = aws_api_gateway_rest_api.rest.id
  resource_id   = aws_api_gateway_resource.details_tracking.id
  http_method   = "GET"
  authorization = "AWS_IAM"
}

# Resource policy — controls which AWS accounts can reach the API at all.
# The deploying account is always included so same-account callers (CI/CD, smoke tests) work.
# Client accounts are added via var.allowed_account_ids — never hardcoded.
#
# Dashboard endpoints are browser-called and carry no AWS credentials, so they need a
# separate public Allow scoped strictly to those paths. SigV4-protected routes are untouched.
data "aws_iam_policy_document" "api_resource_policy" {
  statement {
    effect = "Allow"
    principals {
      type = "AWS"
      identifiers = concat(
        ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"],
        [for account_id in var.allowed_account_ids : "arn:aws:iam::${account_id}:root"]
      )
    }
    actions   = ["execute-api:Invoke"]
    resources = ["${aws_api_gateway_rest_api.rest.execution_arn}/*"]
  }

  # Allow unauthenticated browser requests to dashboard endpoints only.
  # Scoped to GET and OPTIONS on the three dashboard paths — /init, /process, /details remain SigV4-only.
  dynamic "statement" {
    for_each = var.enable_public_dashboard ? [1] : []

    content {
      effect = "Allow"
      principals {
        type        = "*"
        identifiers = ["*"]
      }
      actions = ["execute-api:Invoke"]
      resources = [
        "${aws_api_gateway_rest_api.rest.execution_arn}/${var.stage_name}/GET/transactions",
        "${aws_api_gateway_rest_api.rest.execution_arn}/${var.stage_name}/GET/transactions/*",
        "${aws_api_gateway_rest_api.rest.execution_arn}/${var.stage_name}/GET/transaction-payment-status",
        "${aws_api_gateway_rest_api.rest.execution_arn}/${var.stage_name}/OPTIONS/transactions",
        "${aws_api_gateway_rest_api.rest.execution_arn}/${var.stage_name}/OPTIONS/transactions/*",
        "${aws_api_gateway_rest_api.rest.execution_arn}/${var.stage_name}/OPTIONS/transaction-payment-status",
      ]
    }
  }
}

resource "aws_api_gateway_rest_api_policy" "policy" {
  rest_api_id = aws_api_gateway_rest_api.rest.id
  policy      = data.aws_iam_policy_document.api_resource_policy.json
}

#lambda integration

resource "aws_api_gateway_integration" "init_integration" {
  rest_api_id             = aws_api_gateway_rest_api.rest.id
  resource_id             = aws_api_gateway_resource.init.id
  http_method             = aws_api_gateway_method.init_post.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = "arn:aws:apigateway:${data.aws_region.current.name}:lambda:path/2015-03-31/functions/${var.lambda_function_arns["initPayment"]}/invocations"
}

resource "aws_api_gateway_integration" "process_integration" {
  rest_api_id             = aws_api_gateway_rest_api.rest.id
  resource_id             = aws_api_gateway_resource.process.id
  http_method             = aws_api_gateway_method.process_post.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = "arn:aws:apigateway:${data.aws_region.current.name}:lambda:path/2015-03-31/functions/${var.lambda_function_arns["processPayment"]}/invocations"
}

resource "aws_api_gateway_integration" "test_integration" {
  rest_api_id             = aws_api_gateway_rest_api.rest.id
  resource_id             = aws_api_gateway_resource.test.id
  http_method             = aws_api_gateway_method.test_get.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = "arn:aws:apigateway:${data.aws_region.current.name}:lambda:path/2015-03-31/functions/${var.lambda_function_arns["testCert"]}/invocations"
}

resource "aws_api_gateway_integration" "details_integration" {
  rest_api_id             = aws_api_gateway_rest_api.rest.id
  resource_id             = aws_api_gateway_resource.details_tracking.id
  http_method             = aws_api_gateway_method.details_get.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = "arn:aws:apigateway:${data.aws_region.current.name}:lambda:path/2015-03-31/functions/${var.lambda_function_arns["getDetails"]}/invocations"
}

#Deployment

resource "aws_api_gateway_deployment" "deployment" {
  rest_api_id = aws_api_gateway_rest_api.rest.id

  triggers = {
    redeployment = sha1(jsonencode([
      # Path resources — included so path_part changes force a fresh deployment snapshot.
      aws_api_gateway_resource.init.id,
      aws_api_gateway_resource.process.id,
      aws_api_gateway_resource.test.id,
      aws_api_gateway_resource.details.id,
      aws_api_gateway_resource.details_tracking.id,

      try(aws_api_gateway_resource.transactions[0].id, ""),
      try(aws_api_gateway_resource.transactions_by_status[0].id, ""),
      try(aws_api_gateway_resource.transaction_payment_status[0].id, ""),

      aws_api_gateway_method.init_post.id,
      aws_api_gateway_method.process_post.id,
      aws_api_gateway_method.test_get.id,
      aws_api_gateway_method.details_get.id,

      try(aws_api_gateway_method.transactions_get[0].id, ""),
      try(aws_api_gateway_method.transactions_by_status_get[0].id, ""),
      try(aws_api_gateway_method.transaction_payment_status_get[0].id, ""),

      try(aws_api_gateway_method.transactions_options[0].id, ""),
      try(aws_api_gateway_method.transactions_by_status_options[0].id, ""),
      try(aws_api_gateway_method.transaction_payment_status_options[0].id, ""),

      aws_api_gateway_integration.init_integration.id,
      aws_api_gateway_integration.process_integration.id,
      aws_api_gateway_integration.test_integration.id,
      aws_api_gateway_integration.details_integration.id,

      try(aws_api_gateway_integration.transactions_integration[0].id, ""),
      try(aws_api_gateway_integration.transactions_by_status_integration[0].id, ""),
      try(aws_api_gateway_integration.transaction_payment_status_integration[0].id, ""),

      try(aws_api_gateway_integration.transactions_options_integration[0].id, ""),
      try(aws_api_gateway_integration.transactions_by_status_options_integration[0].id, ""),
      try(aws_api_gateway_integration.transaction_payment_status_options_integration[0].id, ""),

      aws_api_gateway_rest_api_policy.policy.policy,
      aws_api_gateway_gateway_response.default_4xx.id,
      aws_api_gateway_gateway_response.default_5xx.id,
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }

  depends_on = [
    aws_api_gateway_integration.init_integration,
    aws_api_gateway_integration.process_integration,
    aws_api_gateway_integration.test_integration,
    aws_api_gateway_integration.details_integration,
    aws_api_gateway_integration.transactions_integration,
    aws_api_gateway_integration.transactions_by_status_integration,
    aws_api_gateway_integration.transaction_payment_status_integration,
    aws_api_gateway_integration.transactions_options_integration,
    aws_api_gateway_integration.transactions_by_status_options_integration,
    aws_api_gateway_integration.transaction_payment_status_options_integration,
  ]
}

#Stage

resource "aws_api_gateway_stage" "stage" {
  deployment_id = aws_api_gateway_deployment.deployment.id
  rest_api_id   = aws_api_gateway_rest_api.rest.id
  stage_name    = var.stage_name
  tags          = var.common_tags
}

# Throttling — protects against runaway clients and abuse.
# 10 requests/second sustained, burst of 20.
resource "aws_api_gateway_method_settings" "all" {
  rest_api_id = aws_api_gateway_rest_api.rest.id
  stage_name  = aws_api_gateway_stage.stage.stage_name
  method_path = "*/*"

  settings {
    throttling_burst_limit = 20
    throttling_rate_limit  = 10
    metrics_enabled        = true
  }
}

#These should go in api gateway
resource "aws_lambda_permission" "init_permission" {
  statement_id  = "AllowAPIGatewayInvokeInit"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_function_arns["initPayment"]
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.rest.execution_arn}/*/POST/init"
}

resource "aws_lambda_permission" "process_permissions" {
  statement_id  = "AllowAPIGatewayInvokeProcess"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_function_arns["processPayment"]
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.rest.execution_arn}/*/POST/process"
}

resource "aws_lambda_permission" "test_permissions" {
  statement_id  = "AllowAPIGatewayInvokeTest"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_function_arns["testCert"]
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.rest.execution_arn}/*/GET/test"
}

resource "aws_lambda_permission" "details_permissions" {
  statement_id  = "AllowAPIGatewayInvokeDetails"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_function_arns["getDetails"]
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.rest.execution_arn}/*/GET/details/*"
}

# Gateway responses — inject CORS headers on API Gateway-generated errors (e.g. Lambda
# timeout → 504, OOM → 502, throttle → 429). Without these the browser sees a CORS error
# instead of the real HTTP status, making server-side failures very hard to diagnose.
resource "aws_api_gateway_gateway_response" "default_4xx" {
  rest_api_id   = aws_api_gateway_rest_api.rest.id
  response_type = "DEFAULT_4XX"

  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin" = "'${var.dashboard_allowed_origin}'"
  }
}

resource "aws_api_gateway_gateway_response" "default_5xx" {
  rest_api_id   = aws_api_gateway_rest_api.rest.id
  response_type = "DEFAULT_5XX"

  response_parameters = {
    "gatewayresponse.header.Access-Control-Allow-Origin" = "'${var.dashboard_allowed_origin}'"
  }
}

# Custom domain — only created when custom_domain is provided.
resource "aws_api_gateway_domain_name" "custom" {
  count                    = var.custom_domain != "" ? 1 : 0
  domain_name              = var.custom_domain
  regional_certificate_arn = var.certificate_arn
  security_policy          = "TLS_1_2"
  lifecycle {
    precondition {
      condition     = var.certificate_arn != ""
      error_message = "certificate_arn is required when custom_domain is set."
    }
    precondition {
      condition     = var.route53_zone_id != ""
      error_message = "route53_zone_id is required when custom_domain is set."
    }
  }

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  tags = var.common_tags
}

resource "aws_api_gateway_base_path_mapping" "mapping" {
  count       = var.custom_domain != "" ? 1 : 0
  api_id      = aws_api_gateway_rest_api.rest.id
  stage_name  = aws_api_gateway_stage.stage.stage_name
  domain_name = aws_api_gateway_domain_name.custom[0].domain_name
  base_path   = ""
}

resource "aws_route53_record" "custom_domain" {
  count   = var.custom_domain != "" ? 1 : 0
  name    = var.custom_domain
  type    = "A"
  zone_id = var.route53_zone_id

  alias {
    name                   = aws_api_gateway_domain_name.custom[0].regional_domain_name
    zone_id                = aws_api_gateway_domain_name.custom[0].regional_zone_id
    evaluate_target_health = false
  }
}
