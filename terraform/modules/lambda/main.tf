data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = "${path.root}/../../src"
  output_path = "${path.root}/../../dist/lambda-deployment-package.zip"
  excludes    = ["*.test.js", "*.spec.js"]
}

resource "aws_lambda_function" "init_payment" {
  filename         = data.archive_file.lambda_zip.output_path
  function_name    = "${var.function_name_prefix}-initPayment"
  role            = var.lambda_execution_role_arn
  handler         = "lambdaHandler.initPaymentHandler"
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256

  runtime         = var.runtime

  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = var.security_group_ids
  }

  # Increase /tmp storage to 5GB
  ephemeral_storage {
    size = 5120
  }

  # Enable SnapStart for faster cold starts
  snap_start {
    apply_on = "PublishedVersions"
  }

  environment {
    variables = var.environment_variables
  }

  tags = var.tags
}

resource "aws_lambda_function" "process_payment" {
  filename         = data.archive_file.lambda_zip.output_path
  function_name    = "${var.function_name_prefix}-processPayment"
  role            = var.lambda_execution_role_arn
  handler         = "lambdaHandler.processPaymentHandler"
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256

  runtime         = var.runtime

  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = var.security_group_ids
  }

  # Increase /tmp storage to 5GB
  ephemeral_storage {
    size = 5120
  }

  # Enable SnapStart for faster cold starts
  snap_start {
    apply_on = "PublishedVersions"
  }

  environment {
    variables = var.environment_variables
  }

  tags = var.tags
}

resource "aws_lambda_function" "get_details" {
  filename         = data.archive_file.lambda_zip.output_path
  function_name    = "${var.function_name_prefix}-getDetails"
  role            = var.lambda_execution_role_arn
  handler         = "lambdaHandler.getDetailsHandler"
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256

  runtime         = var.runtime

  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = var.security_group_ids
  }

  # Increase /tmp storage to 5GB
  ephemeral_storage {
    size = 5120
  }

  # Enable SnapStart for faster cold starts
  snap_start {
    apply_on = "PublishedVersions"
  }

  environment {
    variables = var.environment_variables
  }

  tags = var.tags
}

resource "aws_lambda_function" "test_cert" {
  filename         = data.archive_file.lambda_zip.output_path
  function_name    = "${var.function_name_prefix}-testCert"
  role            = var.lambda_execution_role_arn
  handler         = "testCert.handler"
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256

  runtime         = var.runtime

  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = var.security_group_ids
  }

  # Increase /tmp storage to 5GB
  ephemeral_storage {
    size = 5120
  }

  # Enable SnapStart for faster cold starts
  snap_start {
    apply_on = "PublishedVersions"
  }

  environment {
    variables = var.environment_variables
  }

  tags = var.tags
}

resource "aws_lambda_permission" "init_payment_apigateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.init_payment.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${var.api_gateway_execution_arn}/*/*"
}

resource "aws_lambda_permission" "process_payment_apigateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.process_payment.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${var.api_gateway_execution_arn}/*/*"
}

resource "aws_lambda_permission" "get_details_apigateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.get_details.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${var.api_gateway_execution_arn}/*/*"
}

resource "aws_lambda_permission" "test_cert_apigateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.test_cert.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${var.api_gateway_execution_arn}/*/*"
}
