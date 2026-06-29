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
  source = "../../../modules/networking"

  vpc_cidr = "10.30.0.0/25"

  availability_zones   = ["us-east-1a", "us-east-1b"]
  public_subnet_cidrs  = ["10.30.0.0/28", "10.30.0.16/28"]
  private_subnet_cidrs = ["10.30.0.32/28", "10.30.0.48/28"]

  # Staging requires AZ-redundant egress: one NAT gateway + EIP + private route
  # table per AZ so a single-AZ outage cannot sever the route to Pay.gov.
  single_nat_gateway = false

  # No pre-existing EIP allocations — a fresh EIP is created for the NAT gateway.
  nat_eip_allocation_ids = {}

  name_prefix = local.name_prefix
  tags = {
    Env     = "stg"
    Project = "ustc-payment-portal"
  }
}

# The old aws_eip.nat_replacement (AZ-a EIP) maps to the new keyed address.
moved {
  from = module.networking.aws_eip.nat_replacement
  to   = module.networking.aws_eip.nat["us-east-1a"]
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
  lambda_name_prefix       = "ustc-payment-portal-stg"
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
