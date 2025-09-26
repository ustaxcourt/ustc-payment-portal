terraform {
  required_version = ">= 1.7.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }
}
terraform {
  backend "s3" {}
}

module "lambda" {
  source = "../../modules/lambda"
  lambda_execution_role_arn       = module.iam.lambda_role_arn
  subnet_ids                      = module.networking.private_subnet_id
  security_group_ids              = module.networking.lambda_security_group_id
  api_gateway_execution_arn       = ""  # Configure this once API Gateway is implemented

  tags = {
    Env     = "dev"
    Project = "ustc-payment-portal"
  }
}
