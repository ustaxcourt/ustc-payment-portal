module "secrets" {
  source                  = "../../modules/secrets"
  environment             = local.environment
  recovery_window_in_days = 30
  lambda_exec_role_arn    = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${local.name_prefix}-lambda-exec"
  enable_mtls             = true
  rds_secret_name         = "rds-credentials"
  tags = {
    Project = "ustc-payment-portal"
    Env     = local.environment
  }
}
