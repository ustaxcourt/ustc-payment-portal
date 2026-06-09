data "aws_caller_identity" "current" {}

locals {
  github_oidc_provider_arn = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com"
  deploy_role_name         = "ustc-payment-processor-${var.environment}-cicd-deployer-role"
  read_only_role_name      = "ustc-payment-processor-${var.environment}-read-only-role"
}

module "networking" {
  source                = "../../modules/networking"
  vpc_cidr              = var.vpc_cidr
  public_subnet_cidr    = var.public_subnet_cidr
  private_subnet_cidr   = var.private_subnet_cidr
  private_subnet_cidr_2 = var.private_subnet_cidr_2
  availability_zone     = var.availability_zone
  availability_zone_2   = var.availability_zone_2
  name_prefix           = var.name_prefix
  tags                  = var.tags
}

module "iam" {
  source                   = "../../modules/iam"
  aws_region               = var.aws_region
  environment              = var.environment
  name_prefix              = var.name_prefix
  deploy_role_name         = local.deploy_role_name
  read_only_role_name      = local.read_only_role_name
  github_oidc_provider_arn = local.github_oidc_provider_arn
  github_org               = var.github_org
  github_repo              = var.github_repo
  state_bucket_name        = var.state_bucket_name
  lambda_name_prefix       = var.lambda_name_prefix
  tags                     = var.tags
}

module "artifacts_bucket" {
  count  = var.create_artifacts_bucket ? 1 : 0
  source = "../../modules/artifacts_bucket"

  build_artifacts_bucket_name = var.build_artifacts_bucket_name
  deployer_role_arn           = module.iam.deployer_role_arn
  staging_deployer_role_arn   = var.staging_deployer_role_arn
  prod_deployer_role_arn      = var.prod_deployer_role_arn
}

resource "aws_iam_role_policy_attachment" "ci_build_artifacts" {
  count      = var.create_artifacts_bucket ? 1 : 0
  role       = module.iam.deployer_role_name
  policy_arn = module.artifacts_bucket[0].build_artifacts_access_policy_arn
}
