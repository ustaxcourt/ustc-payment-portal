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

locals {
  name_prefix              = "ustc-payment-portal-stg"
  environment              = "stg"
  aws_region               = "us-east-1"
  node_env                 = "development"
  app_env                  = "stg"
  github_org               = "ustaxcourt"
  github_repo              = "ustc-payment-portal"
  github_oidc_provider_arn = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com"
  state_bucket_name        = "ustc-payment-portal-terraform-state-stg"
}

module "networking" {
  source                = "../../../modules/networking"
  vpc_cidr              = "10.30.0.0/25"
  public_subnet_cidr    = "10.30.0.0/28"
  private_subnet_cidr   = "10.30.0.32/28"
  private_subnet_cidr_2 = "10.30.0.48/28"
  availability_zone     = "us-east-1a"
  availability_zone_2   = "us-east-1b"
  name_prefix           = local.name_prefix
  tags = {
    Env     = "stg"
    Project = "ustc-payment-portal"
  }
}

module "iam" {
  source                   = "../../../modules/iam"
  aws_region               = local.aws_region
  environment              = local.environment
  name_prefix              = local.name_prefix
  deploy_role_name         = "ustc-payment-processor-${local.environment}-cicd-deployer-role"
  read_only_role_name      = "ustc-payment-processor-${local.environment}-read-only-role"
  github_oidc_provider_arn = local.github_oidc_provider_arn
  github_org               = local.github_org
  github_repo              = local.github_repo
}
