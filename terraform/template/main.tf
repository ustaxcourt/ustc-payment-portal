terraform {

  backend "s3" {

  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.prjoect_name
      Environment = local.Environment
      ManagedBy   = "terraform"
    }
  }
}

# Data sources

data "aws_caller_identity" "current" {}

data "aws_region" "current" {}


data "aws_secretsmanager_secret" "access_token" {
  name = local.access_token_secret_name
}


data "aws_secretsmanager_secret_version" "access_token" {
  secret_id = data.aws_secretsmanager_secret.access_token.id
}

data "aws_secretsmanager_secret_version" "rds_credentials" {
  secret_id = aws_secretsmanager_secret.rds_credentials.id
}

# S3 Module
module "s3" {
  source = "./modules/s3"

  project_name              = var.project_name
  environment               = local.environment
  s3_force_destroy          = var.s3_force_destroy
  bucket_name               = local.bucket_name
  lambda_execution_role_arn = aws_iam_role.lambda_execution_role.arn
  common_tags               = local.common_tags
}


module "lambda" {
  source = "./modules/lambda"

  project_name              = var.project_name
  environment               = local.environment
  lambda_runtime            = var.lambda_runtime
  lambda_timeout            = var.lambda_timeout
  lambda_memory_size        = var.lambda_memory_size
  lambda_execution_role_arn = aws_iam_role.lambda_execution_role.arn
  s3_bucket_id              = module.s3.bucket_id
  base_url                  = var.base_url
  custom_domain             = local.custom_domain
  access_token              = data.aws_secretsmanager_secret_version.access_token.secret_string
  node_env                  = var.node_env
  common_tags               = local.common_tags
}


# API Gateway Module
module "api_gateway" {
  source = "./modules/api-gateway"

  project_name                = var.project_name
  environment                 = local.environment
  api_gateway_stage_name      = var.api_gateway_stage_name
  soap_api_function_name      = module.lambda.soap_api_function_name
  soap_api_invoke_arn         = module.lambda.soap_api_invoke_arn
  soap_resource_function_name = module.lambda.soap_resource_function_name
  soap_resource_invoke_arn    = module.lambda.soap_resource_invoke_arn
  pay_page_function_name      = module.lambda.pay_page_function_name
  pay_page_invoke_arn         = module.lambda.pay_page_invoke_arn
  common_tags                 = local.common_tags
}
