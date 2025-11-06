locals {
  aws_region   = "us-east-1"
  environment  = "stg"
  node_env     = "staging"
  mtls_enabled = true
  lambda_env_base = {
    NODE_ENV                           = local.node_env
    PAYMENT_URL                        = local.payment_url
    SOAP_URL                           = local.soap_url
    API_ACCESS_TOKEN_SECRET_ID         = module.secrets.api_access_token_secret_id
    CERT_PASSPHRASE_SECRET_ID          = module.secrets.cert_passphrase_secret_id
    PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID = module.secrets.paygov_dev_server_token_secret_id
    TCS_APP_ID                         = module.secrets.tcs_app_id_secret_id
  }

  lambda_env_mtls = local.mtls_enabled ? {
    PRIVATE_KEY_SECRET_ID = module.secrets.private_key_secret_id
    CERTIFICATE_SECRET_ID = module.secrets.certificate_secret_id
  } : {}
  lambda_env               = merge(local.lambda_env_base, local.lambda_env_mtls)
  github_oidc_provider_arn = "arn:aws:iam::747103385969:oidc-provider/token.actions.githubusercontent.com"
  github_org               = "ustaxcourt"
  github_repo              = "ustc-payment-portal"
  state_bucket_name        = "ustc-payment-portal-terraform-state-stg"
  state_lock_table_name    = "ustc-payment-portal-terraform-locks-stg"
  state_object_keys = [
    "ustc-payment-portal/stg/*"
  ]
  lambda_exec_role_arn = "arn:aws:iam::747103385969:role/ustc-payment-portal-stg-lambda-exec"
  name_prefix          = "ustc-payment-portal-stg"
  payment_url          = "https://qa.pay.gov/tcsonline/payment.do"
  soap_url             = "https://qa.tcs.pay.gov/services/TCSOnlineService/3.3/"
}

