locals {
  aws_region   = "us-east-1"
  environment  = var.namespace
  node_env     = "development"
  mtls_enabled = false
  lambda_env_base = {
    NODE_ENV                           = local.node_env
    PAYMENT_URL                        = local.payment_url
    SOAP_URL                           = local.soap_url
    API_ACCESS_TOKEN_SECRET_ID         = module.secrets.api_access_token_secret_id
    CERT_PASSPHRASE_SECRET_ID          = module.secrets.cert_passphrase_secret_id
    PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID = module.secrets.paygov_dev_server_token_secret_id
    TCS_APP_ID                         = module.secrets.tcs_app_id_secret_id
  }

  rds_creds = jsondecode(
    data.aws_secretsmanager_secret_version.rds_credentials.secret_string
  )

  lambda_env_mtls = local.mtls_enabled ? {
    PRIVATE_KEY_SECRET_ID = module.secrets.private_key_secret_id
    CERTIFICATE_SECRET_ID = module.secrets.certificate_secret_id
  } : {}
  lambda_env               = merge(local.lambda_env_base, local.lambda_env_mtls)
  github_oidc_provider_arn = "arn:aws:iam::723609007960:oidc-provider/token.actions.githubusercontent.com"
  github_org               = "ustaxcourt"
  github_repo              = "ustc-payment-portal"
  state_bucket_name        = "ustc-payment-portal-terraform-state-dev"
  state_lock_table_name    = "ustc-payment-portal-terraform-locks-dev"
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
}

