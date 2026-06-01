terraform {
  required_version = "~> 1.14.0"

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

data "aws_caller_identity" "current" {}

data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

module "networking" {
  source                = "../../../modules/networking"
  vpc_cidr              = "10.40.0.0/25"
  public_subnet_cidr    = "10.40.0.0/28"
  private_subnet_cidr   = "10.40.0.32/28"
  private_subnet_cidr_2 = "10.40.0.48/28"
  availability_zone     = "us-east-1a"
  availability_zone_2   = "us-east-1b"
  name_prefix           = "ustc-payment-portal-prod"
  tags = {
    Env     = "prod"
    Project = "ustc-payment-portal"
  }
}

module "iam" {
  source = "../../../modules/iam"

  aws_region               = "us-east-1"
  environment              = "prod"
  name_prefix              = "ustc-payment-portal-prod"
  deploy_role_name         = "ustc-payment-processor-prod-cicd-deployer-role"
  github_oidc_provider_arn = data.aws_iam_openid_connect_provider.github.arn
  github_org               = "ustaxcourt"
  github_repo              = "ustc-payment-portal"
  state_bucket_name        = "ustc-payment-portal-terraform-state-prod"
  state_object_keys        = ["ustc-payment-portal/prod/*"]
  lambda_exec_role_arn     = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/ustc-payment-portal-prod-lambda-exec"
  lambda_name_prefix       = "ustc-payment-portal-prod"
  create_lambda_exec_role  = true
  create_deployer_role     = true

  tags = {
    Env     = "prod"
    Project = "ustc-payment-portal"
  }
}
