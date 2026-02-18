data "terraform_remote_state" "foundation" {
  backend = "s3"
  config = {
    bucket         = "ustc-payment-portal-terraform-state-prod"
    key            = "ustc-payment-portal/prod/networking.tfstate"
    region         = "us-east-1"
    dynamodb_table = "ustc-payment-portal-terraform-locks-prod"
    encrypt        = true
  }
}

data "aws_caller_identity" "current" {}

resource "random_password" "rds_master" {
  length           = 32
  special          = true
  override_special = "!#$%^&*()-_=+[]{}<>:?"
  keepers = {
    db_identifier = "${local.name_prefix}-db"
  }
}

resource "aws_secretsmanager_secret_version" "rds_credentials" {
  secret_id = module.secrets.rds_credentials_secret_id
  secret_string = jsonencode({
    username = "payment_portal_admin"
    password = random_password.rds_master.result
  })
}

module "lambda" {
  source                    = "../../modules/lambda"
  function_name_prefix      = local.name_prefix
  lambda_execution_role_arn = module.iam_cicd.lambda_role_arn
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

module "rds" {
  source = "../../modules/rds"

  identifier = "${local.name_prefix}-db"
  db_name    = "paymentportal"
  username   = "payment_portal_admin"
  password   = random_password.rds_master.result

  db_subnet_group_name = data.terraform_remote_state.foundation.outputs.db_subnet_group_name

  vpc_security_group_ids = [
    data.terraform_remote_state.foundation.outputs.rds_security_group_id
  ]

  multi_az            = true
  deletion_protection = true
  skip_final_snapshot = false
}

module "api" {
  source = "../../modules/api-gateway"

  lambda_function_arns = module.lambda.function_arns
  environment          = "prod"
  stage_name           = "prod"

}

module "iam_cicd" {
  source = "../../modules/iam"

  aws_region               = local.aws_region
  environment              = local.environment
  name_prefix              = local.name_prefix
  deploy_role_name         = "ustc-payment-processor-prod-cicd-deployer-role"
  github_oidc_provider_arn = local.github_oidc_provider_arn
  github_org               = local.github_org
  github_repo              = local.github_repo
  state_bucket_name        = local.state_bucket_name
  state_lock_table_name    = local.state_lock_table_name
  state_object_keys        = local.state_object_keys
  lambda_exec_role_arn     = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${local.name_prefix}-lambda-exec"
  lambda_name_prefix       = local.name_prefix
  create_lambda_exec_role  = true
}

