terraform {
  required_version = "~> 1.15.0"

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
  name_prefix              = "ustc-payment-portal-prod"
  environment              = "prod"
  aws_region               = "us-east-1"
  node_env                 = "production"
  app_env                  = "prod"
  github_org               = "ustaxcourt"
  github_repo              = "ustc-payment-portal"
  github_oidc_provider_arn = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com"
  state_bucket_name        = "ustc-payment-portal-terraform-state-prod"
}

module "networking" {
  source = "../../../modules/networking"

  vpc_cidr = "10.40.0.0/25"

  availability_zones   = ["us-east-1a", "us-east-1b"]
  public_subnet_cidrs  = ["10.40.0.0/28", "10.40.0.16/28"]
  private_subnet_cidrs = ["10.40.0.32/28", "10.40.0.48/28"]

  # Prod requires AZ-redundant egress: one NAT gateway + EIP + private route
  # table per AZ so a single-AZ outage cannot sever the route to Pay.gov.
  single_nat_gateway = false

  # AZ-a uses the Pay.gov-allowlisted EIP. AZ-b gets a new EIP;
  # submit that IP to Pay.gov for allowlisting before switching prod
  # Lambdas to private_subnet_ids.
  nat_eip_allocation_ids = {
    "us-east-1a" = "eipalloc-008587cebd5d34afb"
  }

  name_prefix = local.name_prefix
  tags = {
    Env     = local.environment
    Project = "ustc-payment-portal"
  }
}

# Prod's old aws_eip.nat_replacement was never used by the NAT gateway
# (the allowlisted EIP was provided via nat_eip_allocation_id instead).
# Reuse it as the AZ-b NAT EIP to avoid allocating a brand-new address.
moved {
  from = module.networking.aws_eip.nat_replacement
  to   = module.networking.aws_eip.nat["us-east-1b"]
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
  lambda_name_prefix       = "ustc-payment-portal-prod"

  tags = {
    Env     = local.environment
    Project = "ustc-payment-portal"
  }
}

# Account-level singleton — one per AWS account per region.
# Must live in foundation so per-environment CI never needs read/write access to the /account ARN.
resource "aws_iam_role" "api_gateway_cloudwatch_logs" {
  name = "${local.name_prefix}-apigw-cloudwatch-logs"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "apigateway.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = {
    Env     = local.environment
    Project = "ustc-payment-portal"
  }
}

resource "aws_iam_role_policy_attachment" "api_gateway_cloudwatch_logs" {
  role       = aws_iam_role.api_gateway_cloudwatch_logs.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs"
}

resource "aws_api_gateway_account" "this" {
  cloudwatch_role_arn = aws_iam_role.api_gateway_cloudwatch_logs.arn
}
