locals {
  aws_region   = "us-east-1"
  environment  = "prod"
  node_env     = "production"
  mtls_enabled = true
  lambda_env_base = {
    NODE_ENV                           = local.node_env
    PAYMENT_URL                        = local.payment_url
    SOAP_URL                           = local.soap_url
    API_ACCESS_TOKEN_SECRET_ID         = module.secrets.api_access_token_secret_id
    CERT_PASSPHRASE_SECRET_ID          = module.secrets.cert_passphrase_secret_id
    PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID = module.secrets.paygov_dev_server_token_secret_id
    TCS_APP_ID                         = module.secrets.tcs_app_id_secret_id
    RDS_ENDPOINT                       = module.rds.endpoint
    RDS_SECRET_ARN                     = module.rds.master_user_secret_arn
  }

  lambda_env_mtls = local.mtls_enabled ? {
    PRIVATE_KEY_SECRET_ID = module.secrets.private_key_secret_id
    CERTIFICATE_SECRET_ID = module.secrets.certificate_secret_id
  } : {}
  lambda_env               = merge(local.lambda_env_base, local.lambda_env_mtls)
  github_oidc_provider_arn = "arn:aws:iam::802939326821:oidc-provider/token.actions.githubusercontent.com"
  github_org               = "ustaxcourt"
  github_repo              = "ustc-payment-portal"
  state_bucket_name        = "ustc-payment-portal-terraform-state-prod"
  state_lock_table_name    = "ustc-payment-portal-terraform-locks-prod"
  state_object_keys = [
    "ustc-payment-portal/prod/*"
  ]
  name_prefix          = "ustc-payment-portal-prod"
  payment_url          = "https://www.pay.gov/tcsonline/payment.do"
  soap_url             = "https://tcs.pay.gov/services/TCSOnlineService/3.3/"
}
