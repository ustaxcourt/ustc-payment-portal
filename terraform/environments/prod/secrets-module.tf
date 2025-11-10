module "secrets" {
  source               = "../../modules/secrets"
  environment          = local.environment
  lambda_exec_role_arn = module.iam_cicd.lambda_role_arn
  enable_mtls          = true
  tags = {
    Project = "ustc-payment-portal"
    Env     = local.environment
  }
}
