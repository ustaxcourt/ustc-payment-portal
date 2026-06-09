module "secrets" {
  source                  = "../../modules/secrets"
  recovery_window_in_days = 0 # PR environments need immediate deletion
  environment             = local.environment
  enable_mtls             = false
  rds_secret_name         = "rds-credentials"
  tags = {
    Project = "ustc-payment-portal"
    Env     = local.environment
  }
}
