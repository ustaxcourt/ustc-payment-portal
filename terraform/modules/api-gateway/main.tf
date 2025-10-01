data "aws_region" "current"{}

locals {
  cors_allow_origin  = "*"  # replace this
  cors_allow_methods = "GET,POST,OPTIONS"
  cors_allow_headers = "Content-Type,Authorization,X-Requested-With"
}

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

#GET /details/{appID}/{payGovTrackingID}
resource "aws_api_gateway_resource" "details" {
  rest_api_id = aws_api_gateway_rest_api.rest.id
  parent_id   = aws_api_gateway_rest_api.rest.root_resource_id
  path_part   = "details"
}

resource "aws_api_gateway_resource" "details_app_id" {
  rest_api_id = aws_api_gateway_rest_api.rest.id
  parent_id   = aws_api_gateway_resource.details.id
  path_part   = "{appId}"
}

resource "aws_api_gateway_resource" "details_tracking" {
  rest_api_id = aws_api_gateway_rest_api.rest.id
  parent_id   = aws_api_gateway_resource.details_app_id.id
  path_part   = "{payGovTrackingId}"
}

#Methods
resource "aws_api_gateway_method" "init_post" {
  rest_api_id   = aws_api_gateway_rest_api.rest.id
  resource_id   = aws_api_gateway_resource.init.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "init_options" {
  rest_api_id   = aws_api_gateway_rest_api.rest.id
  resource_id   = aws_api_gateway_resource.init.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "init_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.rest.id
  resource_id = aws_api_gateway_resource.init.id
  http_method = aws_api_gateway_method.init_options.http_method
  type        = "MOCK"
  request_templates = {
    "application/json" = jsonencode({
      statusCode = 200
    })
  }
}

resource "aws_api_gateway_method_response" "init_options_200" {
  rest_api_id = aws_api_gateway_rest_api.rest.id
  resource_id = aws_api_gateway_resource.init.id
  http_method = aws_api_gateway_method.init_options.http_method
  status_code = "200"
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "init_options_200" {
  rest_api_id = aws_api_gateway_rest_api.rest.id
  resource_id = aws_api_gateway_resource.init.id
  http_method = aws_api_gateway_method.init_options.http_method
  status_code = aws_api_gateway_method_response.init_options_200.status_code
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'${local.cors_allow_origin}'"
    "method.response.header.Access-Control-Allow-Methods" = "'${local.cors_allow_methods}'"
    "method.response.header.Access-Control-Allow-Origin"  = "'${local.cors_allow_methods}'"
  }

  depends_on = [aws_api_gateway_integration.init_options_integration]
}

resource "aws_api_gateway_method" "process_post" {
  rest_api_id   = aws_api_gateway_rest_api.rest.id
  resource_id   = aws_api_gateway_resource.process.id
  http_method   = "POST"
  authorization = "NONE"
}

#Options for /process

resource "aws_api_gateway_method" "process_options" {
  rest_api_id   = aws_api_gateway_rest_api.rest.id
  resource_id   = aws_api_gateway_resource.process.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "process_options_integration" {
  rest_api_id       = aws_api_gateway_rest_api.rest.id
  resource_id       = aws_api_gateway_resource.process.id
  http_method       = aws_api_gateway_method.process_options.http_method
  type              = "MOCK"
  request_templates = {
    "application/json" = jsonencode({
      statusCode = 200
    })
  }
}

resource "aws_api_gateway_method_response" "process_options_200" {
  rest_api_id = aws_api_gateway_rest_api.rest.id
  resource_id = aws_api_gateway_resource.process.id
  http_method = aws_api_gateway_method.process_options.http_method
  status_code = "200"

  response_models = { "application/json" = "Empty" }
  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Headers" = true
  }
}

resource "aws_api_gateway_integration_response" "process_options_200" {
  rest_api_id = aws_api_gateway_rest_api.rest.id
  resource_id = aws_api_gateway_resource.process.id
  http_method = aws_api_gateway_method.process_options.http_method
  status_code = aws_api_gateway_method_response.process_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = "'${local.cors_allow_origin}'"
    "method.response.header.Access-Control-Allow-Methods" = "'${local.cors_allow_methods}'"
    "method.response.header.Access-Control-Allow-Headers" = "'${local.cors_allow_headers}'"
  }

  depends_on = [aws_api_gateway_integration.process_options_integration]
}

resource "aws_api_gateway_method" "test_get" {
  rest_api_id   = aws_api_gateway_rest_api.rest.id
  resource_id   = aws_api_gateway_resource.test.id
  http_method   = "GET"
  authorization = "NONE"
}

#Options for /test

resource "aws_api_gateway_method" "test_options" {
  rest_api_id   = aws_api_gateway_rest_api.rest.id
  resource_id   = aws_api_gateway_resource.test.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "test_options_integration" {
  rest_api_id       = aws_api_gateway_rest_api.rest.id
  resource_id       = aws_api_gateway_resource.test.id
  http_method       = aws_api_gateway_method.test_options.http_method
  type              = "MOCK"
  request_templates = { "application/json" = "{\"statusCode\": 200}" }
}

resource "aws_api_gateway_method_response" "test_options_200" {
  rest_api_id = aws_api_gateway_rest_api.rest.id
  resource_id = aws_api_gateway_resource.test.id
  http_method = aws_api_gateway_method.test_options.http_method
  status_code = "200"

  response_models = { "application/json" = "Empty" }
  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Headers" = true
  }
}

resource "aws_api_gateway_integration_response" "test_options_200" {
  rest_api_id = aws_api_gateway_rest_api.rest.id
  resource_id = aws_api_gateway_resource.test.id
  http_method = aws_api_gateway_method.test_options.http_method
  status_code = aws_api_gateway_method_response.test_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = "'${local.cors_allow_origin}'"
    "method.response.header.Access-Control-Allow-Methods" = "'${local.cors_allow_methods}'"
    "method.response.header.Access-Control-Allow-Headers" = "'${local.cors_allow_headers}'"
  }

  depends_on = [aws_api_gateway_integration.test_options_integration]
}

resource "aws_api_gateway_method" "details_get" {
  rest_api_id   = aws_api_gateway_rest_api.rest.id
  resource_id   = aws_api_gateway_resource.details_tracking.id
  http_method   = "GET"
  authorization = "NONE"
  request_parameters = {

  }
}

#Options for /details

resource "aws_api_gateway_method" "details_options" {
  rest_api_id   = aws_api_gateway_rest_api.rest.id
  resource_id   = aws_api_gateway_resource.details_tracking.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "details_options_integration" {
  rest_api_id       = aws_api_gateway_rest_api.rest.id
  resource_id       = aws_api_gateway_resource.details_tracking.id
  http_method       = aws_api_gateway_method.details_options.http_method
  type              = "MOCK"
  request_templates = { "application/json" = "{\"statusCode\": 200}" }
}

resource "aws_api_gateway_method_response" "details_options_200" {
  rest_api_id = aws_api_gateway_rest_api.rest.id
  resource_id = aws_api_gateway_resource.details_tracking.id
  http_method = aws_api_gateway_method.details_options.http_method
  status_code = "200"

  response_models = { "application/json" = "Empty" }
  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Headers" = true
  }
}

resource "aws_api_gateway_integration_response" "details_options_200" {
  rest_api_id = aws_api_gateway_rest_api.rest.id
  resource_id = aws_api_gateway_resource.details_tracking.id
  http_method = aws_api_gateway_method.details_options.http_method
  status_code = aws_api_gateway_method_response.details_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = "'${local.cors_allow_origin}'"
    "method.response.header.Access-Control-Allow-Methods" = "'${local.cors_allow_methods}'"
    "method.response.header.Access-Control-Allow-Headers" = "'${local.cors_allow_headers}'"
  }

  depends_on = [aws_api_gateway_integration.details_options_integration]
}

#lambda integration

resource "aws_api_gateway_integration" "init_integration" {
  rest_api_id          = aws_api_gateway_rest_api.rest.id
  resource_id          = aws_api_gateway_resource.init.id
  http_method          = aws_api_gateway_method.init_post.http_method
  type                 = "AWS_PROXY"
  integration_http_method = "POST"
  uri         = "arn:aws:apigateway:${data.aws_region.current.name}:lambda:path/2015-03-31/functions/${var.lambda_function_arns["initPayment"]}/invocations"
}

resource "aws_api_gateway_integration" "process_integration" {
  rest_api_id          = aws_api_gateway_rest_api.rest.id
  resource_id          = aws_api_gateway_resource.process.id
  http_method          = aws_api_gateway_method.process_post.http_method
  type                 = "AWS_PROXY"
  integration_http_method = "POST"
  uri = "arn:aws:apigateway:${data.aws_region.current.name}:lambda:path/2015-03-31/functions/${var.lambda_function_arns["processPayment"]}/invocations"
}

resource "aws_api_gateway_integration" "test_integration" {
  rest_api_id          = aws_api_gateway_rest_api.rest.id
  resource_id          = aws_api_gateway_resource.test.id
  http_method          = aws_api_gateway_method.test_get.http_method
  type                 = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = "arn:aws:apigateway:${data.aws_region.current.name}:lambda:path/2015-03-31/functions/${var.lambda_function_arns["testCert"]}/invocations"
}

resource "aws_api_gateway_integration" "details_integration" {
  rest_api_id          = aws_api_gateway_rest_api.rest.id
  resource_id          = aws_api_gateway_resource.details_tracking.id
  http_method          = aws_api_gateway_method.details_get.http_method
  type                 = "AWS_PROXY"
  integration_http_method = "POST"
  uri                   = "arn:aws:apigateway:${data.aws_region.current.name}:lambda:path/2015-03-31/functions/${var.lambda_function_arns["getDetails"]}/invocations"
}

#Deployment 

resource "aws_api_gateway_deployment" "deployment" {
  rest_api_id = aws_api_gateway_rest_api.rest.id

  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_integration.init_integration.id,
      aws_api_gateway_integration.process_integration.id,
      aws_api_gateway_integration.test_integration.id,
      aws_api_gateway_integration.details_integration.id,
      aws_api_gateway_integration.init_options_integration.id,  #need to add process, test and detil OPTIONS integrations later
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
    aws_api_gateway_integration.init_options_integration #need to add process, test and detil OPTIONS integrations
  ]
}

#Stage

resource "aws_api_gateway_stage" "stage" {
  deployment_id = aws_api_gateway_deployment.deployment.id
  rest_api_id   = aws_api_gateway_rest_api.rest.id
  stage_name    = var.stage_name
  tags       = var.common_tags
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
  source_arn    = "${aws_api_gateway_rest_api.rest.execution_arn}/*/GET/details/*/*"
}
