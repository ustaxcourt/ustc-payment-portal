module "secrets" {
  source                  = "../../modules/secrets"
  environment             = local.environment
  recovery_window_in_days = 30
  lambda_exec_role_arn    = data.terraform_remote_state.foundation.outputs.lambda_role_arn
  enable_mtls             = true

  # Stg uses AWS-managed RDS password - don't create our own RDS secret
  create_rds_secret      = false
  additional_secret_arns = [module.rds.master_user_secret_arn]

  tags = {
    Project = "ustc-payment-portal"
    Env     = local.environment
  }
}
