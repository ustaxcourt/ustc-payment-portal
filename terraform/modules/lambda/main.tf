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

data "archive_file" "lambda_zip" {
  for_each = local.lambda_functions

  type        = "zip"
  source_dir  = "${path.root}/../../dist/${each.key}"
  output_path = "${path.root}/../../dist/${each.key}-deployment-package.zip"

  depends_on = [null_resource.build_lambdas]
}

resource "null_resource" "build_lambdas" {
  triggers = {
    # Rebuild when source files change
    src_hash = sha256(join("", [for f in fileset("${path.root}/../../src", "**/*.ts") : filesha256("${path.root}/../../src/${f}")]))
    # Rebuild when build script changes
    build_script_hash = filesha256("${path.root}/../scripts/build-lambda.sh")
  }

  provisioner "local-exec" {
    command     = "cd ${path.root}/../.. && npm run build:lambda"
    working_dir = "${path.root}/../.."
  }
}

resource "aws_lambda_function" "functions" {
  for_each = local.lambda_functions

  filename         = data.archive_file.lambda_zip[each.key].output_path
  function_name    = "${var.function_name_prefix}-${each.key}"
  role            = var.lambda_execution_role_arn
  handler         = each.value.handler
  source_code_hash = data.archive_file.lambda_zip[each.key].output_base64sha256

  runtime         = var.runtime

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
  for_each = local.lambda_functions

  name              = "/aws/lambda/${var.function_name_prefix}-${each.key}"
  retention_in_days = var.log_retention_days
  tags              = var.tags

  lifecycle {
    create_before_destroy = true
  }
}
