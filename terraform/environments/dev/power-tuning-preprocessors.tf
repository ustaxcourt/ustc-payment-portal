# Power Tuning pre-processors — DEV ONLY.
#
# aws-lambda-power-tuning invokes a per-target "pre-processor" Lambda before each
# tuning iteration and uses its return value as that iteration's payload. Two
# targets need per-invocation freshness, so each gets a dedicated pre-processor:
#
#   * initRefGenerator   — rewrites the initPayment body with a fresh
#     transactionReferenceId. Zero AWS access (CloudWatch Logs only).
#   * processTokenMinter — mints a fresh `initiated` token per invocation by
#     directly invoking the dev initPayment Lambda and completing the payment on
#     the mock Pay.gov server. Needs lambda:InvokeFunction on dev initPayment.
#
# Both are guarded to the real `dev` workspace: the environments/dev root module
# is also applied for every ephemeral PR workspace in the same account, and PR
# stacks must not spin up their own tuning helpers.
#
# FOUNDATION DEPENDENCY: the shared dev CI deployer role can create roles named
# `ustc-payment-processor-*`, but its iam:PassRole is scoped to the shared Lambda
# execution role only. foundation/dev-networking/power-tuning.tf grants the
# deployer iam:PassRole for the `ustc-payment-processor-tuner-*` roles below.
# That foundation apply must land before this stack can create + pass them.

locals {
  power_tuning_preprocessors_enabled = local.environment == "dev" ? 1 : 0

  init_payment_function_arn = "arn:aws:lambda:${local.aws_region}:${data.aws_caller_identity.current.account_id}:function:ustc-payment-processor-initPayment"
}

# --- init ref-generator: zero AWS access (CloudWatch Logs only) ---------------
resource "aws_iam_role" "tuner_init_refgen" {
  count = local.power_tuning_preprocessors_enabled
  name  = "${local.name_prefix}-tuner-init-refgen-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = {
    Env     = local.environment
    Project = "ustc-payment-portal"
    Purpose = "Power tuning pre-processor - initPayment"
  }
}

resource "aws_iam_role_policy_attachment" "tuner_init_refgen_logs" {
  count      = local.power_tuning_preprocessors_enabled
  role       = aws_iam_role.tuner_init_refgen[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_lambda_function" "tuner_init_refgen" {
  count = local.power_tuning_preprocessors_enabled

  s3_bucket        = var.artifact_bucket
  s3_key           = var.initRefGenerator_s3_key
  source_code_hash = var.initRefGenerator_source_code_hash

  function_name = "${local.name_prefix}-tuner-init-refgen"
  role          = aws_iam_role.tuner_init_refgen[0].arn
  handler       = "initRefGenerator.handler"
  runtime       = "nodejs22.x"
  timeout       = 10
  memory_size   = 128

  tags = {
    Env     = local.environment
    Project = "ustc-payment-portal"
  }
}

resource "aws_cloudwatch_log_group" "tuner_init_refgen" {
  count             = local.power_tuning_preprocessors_enabled
  name              = "/aws/lambda/${local.name_prefix}-tuner-init-refgen"
  retention_in_days = 14

  tags = {
    Env     = local.environment
    Project = "ustc-payment-portal"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# --- process token-minter: invokes dev initPayment ----------------------------
resource "aws_iam_role" "tuner_token_minter" {
  count = local.power_tuning_preprocessors_enabled
  name  = "${local.name_prefix}-tuner-token-minter-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = {
    Env     = local.environment
    Project = "ustc-payment-portal"
    Purpose = "Power tuning pre-processor - processPayment"
  }
}

resource "aws_iam_role_policy_attachment" "tuner_token_minter_logs" {
  count      = local.power_tuning_preprocessors_enabled
  role       = aws_iam_role.tuner_token_minter[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# The only privilege beyond logging: invoke the dev initPayment Lambda to mint a
# fresh `initiated` token. Scoped to the single dev initPayment function ARN.
resource "aws_iam_role_policy" "tuner_token_minter_invoke_init" {
  count = local.power_tuning_preprocessors_enabled
  name  = "invoke-dev-init-payment"
  role  = aws_iam_role.tuner_token_minter[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "InvokeDevInitPayment"
      Effect   = "Allow"
      Action   = "lambda:InvokeFunction"
      Resource = local.init_payment_function_arn
    }]
  })
}

resource "aws_lambda_function" "tuner_token_minter" {
  count = local.power_tuning_preprocessors_enabled

  s3_bucket        = var.artifact_bucket
  s3_key           = var.processTokenMinter_s3_key
  source_code_hash = var.processTokenMinter_source_code_hash

  function_name = "${local.name_prefix}-tuner-token-minter"
  role          = aws_iam_role.tuner_token_minter[0].arn
  handler       = "processTokenMinter.handler"
  runtime       = "nodejs22.x"
  timeout       = 30
  memory_size   = 256

  # No vpc_config: the minter reaches the Lambda control plane and the public
  # mock Pay.gov server over the internet, and needs no in-VPC resources.
  environment {
    variables = {
      INIT_PAYMENT_FUNCTION_NAME = "ustc-payment-processor-initPayment"
      TUNING_FEE_KEY             = "PETITION_FILING_FEE"
      TUNING_CALLER_ARN          = "arn:aws:sts::${data.aws_caller_identity.current.account_id}:assumed-role/ustc-power-tuning/tuning"
      NODE_ENV                   = "production"
      APP_ENV                    = "dev"
    }
  }

  tags = {
    Env     = local.environment
    Project = "ustc-payment-portal"
  }
}

resource "aws_cloudwatch_log_group" "tuner_token_minter" {
  count             = local.power_tuning_preprocessors_enabled
  name              = "/aws/lambda/${local.name_prefix}-tuner-token-minter"
  retention_in_days = 14

  tags = {
    Env     = local.environment
    Project = "ustc-payment-portal"
  }

  lifecycle {
    create_before_destroy = true
  }
}
