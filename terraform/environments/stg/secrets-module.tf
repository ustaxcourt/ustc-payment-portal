module "secrets" {
  source                  = "../../modules/secrets"
  environment             = local.environment
  recovery_window_in_days = 30
  lambda_exec_role_arn    = data.terraform_remote_state.foundation.outputs.lambda_role_arn
  enable_mtls             = true
  rds_secret_name         = "rds-credentials"
  tags = {
    Project = "ustc-payment-portal"
    Env     = local.environment
  }
}
