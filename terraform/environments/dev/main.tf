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

module "lambda" {
  source                    = "../../modules/lambda"
  function_name_prefix      = local.name_prefix
  lambda_execution_role_arn = data.terraform_remote_state.foundation.outputs.lambda_role_arn
  subnet_ids                = [data.terraform_remote_state.foundation.outputs.private_subnet_id]
  security_group_ids        = [data.terraform_remote_state.foundation.outputs.lambda_security_group_id]
  environment_variables     = local.lambda_env
  tags = {
    Env     = local.environment
    Project = "ustc-payment-portal"
  }
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

