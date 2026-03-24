locals {
  aws_region    = "us-east-1"
  environment   = var.namespace
  node_env      = "development"
  mtls_enabled  = false
  custom_domain = "dev-payments.ustaxcourt.gov"
  lambda_env_base = {
    NODE_ENV                           = local.node_env
    PAYMENT_URL                        = local.payment_url
    SOAP_URL                           = local.soap_url
    CERT_PASSPHRASE_SECRET_ID          = module.secrets.cert_passphrase_secret_id
    PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID = module.secrets.paygov_dev_server_token_secret_id
    CLIENT_PERMISSIONS_SECRET_ID       = module.secrets.client_permissions_secret_id
    RDS_ENDPOINT                       = local.environment == "dev" ? module.rds[0].endpoint : ""
    RDS_SECRET_ARN                     = local.environment == "dev" ? module.secrets.rds_credentials_secret_arn : ""
    RDS_DB_NAME                        = local.environment == "dev" ? "paymentportal" : ""
  }

  lambda_env_mtls = local.mtls_enabled ? {
    PRIVATE_KEY_SECRET_ID = module.secrets.private_key_secret_id
    CERTIFICATE_SECRET_ID = module.secrets.certificate_secret_id
  } : {}
  lambda_env               = merge(local.lambda_env_base, local.lambda_env_mtls)
  github_oidc_provider_arn = "arn:aws:iam::723609007960:oidc-provider/token.actions.githubusercontent.com"
  github_org               = "ustaxcourt"
  github_repo              = "ustc-payment-portal"
  state_bucket_name        = "ustc-payment-portal-terraform-state-dev"
  state_object_keys = [
    "ustc-payment-portal/dev/networking.tfstate",
    "ustc-payment-portal/dev/dev.tfstate",
  ]
  lambda_exec_role_arn = "arn:aws:iam::723609007960:role/ustc-payment-portal-dev-lambda-exec"
  # Conditional naming: dev uses original names, PR environments get suffixes
  name_prefix = local.environment == "dev" ? "ustc-payment-processor" : "ustc-payment-processor-${local.environment}"
  payment_url = "https://pay-gov-dev.ustaxcourt.gov/pay"
  soap_url    = "https://pay-gov-dev.ustaxcourt.gov/wsdl"

  # Artifacts bucket policy ARN (constructed dynamically for PR workspaces)
  artifacts_bucket_policy_arn = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/build-artifacts-access-policy"

  # AWS account IDs allowed to invoke the API Gateway cross-account
  # Read from Secrets Manager - populated via AWS CLI/Console, not hardcoded
  allowed_client_account_ids = try(
    jsondecode(data.aws_secretsmanager_secret_version.allowed_account_ids.secret_string),
    []
  )
}

