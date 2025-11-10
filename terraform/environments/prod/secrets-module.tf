module "secrets" {
  source               = "../../modules/secrets"
  environment          = local.environment
  lambda_exec_role_arn = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${local.name_prefix}-lambda-exec"
  enable_mtls          = true
  tags = {
    Project = "ustc-payment-portal"
    Env     = local.environment
  }
}
