data "aws_caller_identity" "current" {}

data "terraform_remote_state" "foundation" {
  backend = "s3"
  config = {
    bucket         = "ustc-payment-portal-terraform-state-dev"
    key            = "ustc-payment-portal/dev/networking.tfstate"
    region         = "us-east-1"
    dynamodb_table = "ustc-payment-portal-terraform-locks-dev"
    encrypt        = true
  }
}

data "aws_secretsmanager_secret_version" "rds_credentials" {
  secret_id = module.secrets.rds_credentials_secret_id
}

module "lambda" {
  source                    = "../../modules/lambda"
  function_name_prefix      = local.name_prefix
  lambda_execution_role_arn = data.terraform_remote_state.foundation.outputs.lambda_role_arn
  subnet_ids                = [data.terraform_remote_state.foundation.outputs.private_subnet_id]
  security_group_ids        = [data.terraform_remote_state.foundation.outputs.lambda_security_group_id]
  environment_variables     = local.lambda_env

  artifact_bucket = var.artifact_bucket
  artifact_s3_keys = {
    initPayment    = var.initPayment_s3_key
    processPayment = var.processPayment_s3_key
    getDetails     = var.getDetails_s3_key
    testCert       = var.testCert_s3_key
  }
  source_code_hashes = {
    initPayment    = var.initPayment_source_code_hash
    processPayment = var.processPayment_source_code_hash
    getDetails     = var.getDetails_source_code_hash
    testCert       = var.testCert_source_code_hash
  }

  tags = {
    Env     = local.environment
    Project = "ustc-payment-portal"
  }
}

module "rds" {
  source = "../../modules/rds"

  identifier = "${local.name_prefix}-db"
  db_name    = "paymentportal"
  username   = local.rds_creds.username
  password   = local.rds_creds.password

  db_subnet_group_name = data.terraform_remote_state.foundation.outputs.db_subnet_group_name

  vpc_security_group_ids = [
    data.terraform_remote_state.foundation.outputs.rds_security_group_id
  ]

  multi_az = true
}

module "api" {
  source = "../../modules/api-gateway"

  lambda_function_arns = module.lambda.function_arns
  environment          = local.environment == "dev" ? "dev" : local.environment
  stage_name           = local.environment == "dev" ? "dev" : local.environment

}

module "iam_cicd" {
  source = "../../modules/iam"

  aws_region               = local.aws_region
  environment              = local.environment
  deploy_role_name         = local.environment == "dev" ? "ustc-payment-processor-dev-cicd-deployer-role" : "${local.name_prefix}-cicd-deployer-role"
  github_oidc_provider_arn = local.github_oidc_provider_arn
  github_org               = local.github_org
  github_repo              = local.github_repo
  state_bucket_name        = local.state_bucket_name
  state_lock_table_name    = local.state_lock_table_name
  state_object_keys        = local.state_object_keys
  lambda_exec_role_arn     = data.terraform_remote_state.foundation.outputs.lambda_role_arn
  lambda_name_prefix       = local.name_prefix
  create_lambda_exec_role  = false
}

module "artifacts_bucket" {
  count  = local.environment == "dev" ? 1 : 0
  source = "../../modules/artifacts_bucket"

  build_artifacts_bucket_name = "ustc-payment-portal-build-artifacts"
  deployer_role_arn           = module.iam_cicd.role_arn
  manage_bucket_policy        = true
  staging_deployer_role_arn   = "arn:aws:iam::747103385969:role/ustc-payment-processor-stg-cicd-deployer-role"
  prod_deployer_role_arn      = "arn:aws:iam::802939326821:role/ustc-payment-processor-prod-cicd-deployer-role"
}

# Reference existing bucket in PR workspaces
data "aws_s3_bucket" "existing_artifacts" {
  count  = local.environment != "dev" ? 1 : 0
  bucket = "ustc-payment-portal-build-artifacts"
}

# Attach artifact bucket policy to deployer role (GitHub Actions --> AWS deployment)
resource "aws_iam_role_policy_attachment" "ci_build_artifacts" {
  role       = module.iam_cicd.role_name
  policy_arn = local.environment == "dev" ? module.artifacts_bucket[0].build_artifacts_access_policy_arn : local.artifacts_bucket_policy_arn
}
