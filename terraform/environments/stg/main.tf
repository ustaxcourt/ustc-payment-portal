data "terraform_remote_state" "foundation" {
  backend = "s3"
  config = {
    bucket         = "ustc-payment-portal-terraform-state-stg"
    key            = "ustc-payment-portal/stg/networking.tfstate"
    region         = "us-east-1"
    dynamodb_table = "ustc-payment-portal-terraform-locks-stg"
    encrypt        = true
  }
}

module "lambda" {
  source                    = "../../modules/lambda"
  lambda_execution_role_arn = data.terraform_remote_state.foundation.outputs.lambda_role_arn
  subnet_ids                = [data.terraform_remote_state.foundation.outputs.private_subnet_id]
  security_group_ids        = [data.terraform_remote_state.foundation.outputs.lambda_security_group_id]
  environment_variables     = local.lambda_env

  # Consume dev artifacts by SHA (keys and optional hashes passed from workflow)
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

module "api" {
  source = "../../modules/api-gateway"

  lambda_function_arns = module.lambda.function_arns
  environment          = "stg"
  stage_name           = "stg"

}

module "iam_cicd" {
  source = "../../modules/iam"

  aws_region               = local.aws_region
  environment              = local.environment
  deploy_role_name         = "${local.name_prefix}-cicd-deployer-role"
  github_oidc_provider_arn = local.github_oidc_provider_arn
  github_org               = local.github_org
  github_repo              = local.github_repo
  state_bucket_name        = local.state_bucket_name
  state_lock_table_name    = local.state_lock_table_name
  state_object_keys        = local.state_object_keys
  lambda_exec_role_arn     = local.lambda_exec_role_arn
  lambda_name_prefix       = local.name_prefix
  create_lambda_exec_role  = true
}
