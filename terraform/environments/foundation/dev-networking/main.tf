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

locals {
  name_prefix              = "ustc-payment-portal-dev"
  environment              = "dev"
  aws_region               = "us-east-1"
  node_env                 = "development"
  app_env                  = "dev"
  github_org               = "ustaxcourt"
  github_repo              = "ustc-payment-portal"
  github_oidc_provider_arn = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com"
  state_bucket_name        = "ustc-payment-portal-terraform-state-dev"
}

module "networking" {
  source                = "../../../modules/networking"
  vpc_cidr              = "10.20.0.0/25"
  public_subnet_cidr    = "10.20.0.0/28"
  private_subnet_cidr   = "10.20.0.32/28"
  private_subnet_cidr_2 = "10.20.0.48/28"
  availability_zone     = "us-east-1a"
  availability_zone_2   = "us-east-1b"
  name_prefix           = local.name_prefix
  tags = {
    Env     = "dev"
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
  state_bucket_name        = local.state_bucket_name
  lambda_name_prefix       = "ustc-payment-processor"
  tags = {
    Env     = "dev"
    Project = "ustc-payment-portal"
  }
}

module "artifacts_bucket" {
  source = "../../../modules/artifacts_bucket"

  build_artifacts_bucket_name = "ustc-payment-portal-build-artifacts"
  deployer_role_arn           = module.iam.deployer_role_arn
  staging_deployer_role_arn   = "arn:aws:iam::747103385969:role/ustc-payment-processor-stg-cicd-deployer-role"
  prod_deployer_role_arn      = "arn:aws:iam::802939326821:role/ustc-payment-processor-prod-cicd-deployer-role"
}

# Attach artifact bucket policy to deployer role (GitHub Actions --> AWS deployment)
resource "aws_iam_role_policy_attachment" "ci_build_artifacts" {
  role       = module.iam.deployer_role_name
  policy_arn = module.artifacts_bucket.build_artifacts_access_policy_arn
}
