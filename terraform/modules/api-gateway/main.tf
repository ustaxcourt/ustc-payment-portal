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

#GET /details/{payGovTrackingId}
resource "aws_api_gateway_resource" "details" {
  rest_api_id = aws_api_gateway_rest_api.rest.id
  parent_id   = aws_api_gateway_rest_api.rest.root_resource_id
  path_part   = "details"
}

resource "aws_api_gateway_resource" "details_tracking" {
  rest_api_id = aws_api_gateway_rest_api.rest.id
  parent_id   = aws_api_gateway_resource.details.id
  path_part   = "{payGovTrackingId}"
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
      aws_api_gateway_method.init_post.id,
      aws_api_gateway_method.process_post.id,
      aws_api_gateway_method.test_get.id,
      aws_api_gateway_method.details_get.id,
      aws_api_gateway_integration.init_integration.id,
      aws_api_gateway_integration.process_integration.id,
      aws_api_gateway_integration.test_integration.id,
      aws_api_gateway_integration.details_integration.id,
      aws_api_gateway_rest_api_policy.policy.id,
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

# Custom domain — only created when custom_domain is provided.
resource "aws_api_gateway_domain_name" "custom" {
  count                    = var.custom_domain != "" ? 1 : 0
  domain_name              = var.custom_domain
  regional_certificate_arn = var.certificate_arn

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
  base_path = ""
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
