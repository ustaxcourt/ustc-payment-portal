module "secrets" {
  source                  = "../../modules/secrets"
  environment             = local.environment
  recovery_window_in_days = 30
  enable_mtls             = true

  # Prod uses AWS-managed RDS password - don't create our own RDS secret
  create_rds_secret = false

  tags = {
    Project = "ustc-payment-portal"
    Env     = local.environment
  }
}
