terraform {
  required_version = ">= 1.7.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {}
}

provider "aws" {
  region = "us-east-1"
}

module "networking" {
  source              = "../../../modules/networking"
  vpc_cidr            = "10.20.0.0/25"
  public_subnet_cidr  = "10.20.0.0/28"
  private_subnet_cidr = "10.20.0.32/28"
  availability_zone   = "us-east-1a"
  name_prefix         = "ustc-payment-portal-dev"
  tags = {
    Env     = "dev"
    Project = "ustc-payment-portal"
  }
}

module "iam" {
  source = "../../../modules/iam"
  name_prefix = "ustc-payment-portal-dev"
  tags = {
    Env = "dev"
    Project = "ustc-payment-portal"
  }
}

module "lambda" {
  source = "../../../modules/lambda"
  lambda_execution_role_arn       = module.iam.lambda_role_arn
  subnet_ids                      = module.networking.private_subnet_id
  security_group_ids              = module.networking.lambda_security_group_id
  api_gateway_execution_arn       = ""  # Configure thisAPI Gateway is implemented

  tags = {
    Env     = "dev"
    Project = "ustc-payment-portal"
  }
}
