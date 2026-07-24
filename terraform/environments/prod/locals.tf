locals {
  aws_region    = "us-east-1"
  environment   = "prod"
  node_env      = "production"
  app_env       = "prod"
  mtls_enabled  = true
  custom_domain = "payments.ustaxcourt.gov"
  rds_db_name   = "paymentportal"

  proxy_max_connections_percent = 100
  lambda_env_payment = merge({
    NODE_ENV                              = local.node_env
    APP_ENV                               = local.app_env
    PAYMENT_URL                           = local.payment_url
    SOAP_URL                              = local.soap_url
    CERT_PASSPHRASE_SECRET_ID             = module.secrets.cert_passphrase_secret_id
    PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID    = module.secrets.paygov_dev_server_token_secret_id
    CLIENT_PERMISSIONS_SECRET_ID          = module.secrets.client_permissions_secret_id
    RDS_ENDPOINT                          = module.rds_proxy.endpoint
    RDS_SECRET_ARN                        = module.rds.master_user_secret_arn
    RDS_DB_NAME                           = local.rds_db_name
    MONITORING_SUBSCRIBERS_PARAMETER_NAME = module.secrets.monitoring_subscribers_parameter_name
    }, local.mtls_enabled ? {
    PRIVATE_KEY_SECRET_ID = module.secrets.private_key_secret_id
    CERTIFICATE_SECRET_ID = module.secrets.certificate_secret_id
  } : {})

  # Migration Lambda: migrationRunner
  # Needs RDS only — no payment secrets. Connects directly, not via proxy (CREATE/DROP DATABASE breaks through a proxy).
  lambda_env_migration = {
    NODE_ENV              = local.node_env
    APP_ENV               = local.app_env
    RDS_ENDPOINT          = module.rds.endpoint
    RDS_SECRET_ARN        = module.rds.master_user_secret_arn
    RDS_MASTER_SECRET_ARN = module.rds.master_user_secret_arn
    RDS_DB_NAME           = local.rds_db_name
  }

  lambda_env_by_function = {
    initPayment     = local.lambda_env_payment
    processPayment  = local.lambda_env_payment
    getDetails      = local.lambda_env_payment
    testCert        = local.lambda_env_payment
    healthCheck     = local.lambda_env_payment
    migrationRunner = local.lambda_env_migration
  }

  # Seeded from PAY-361's dev tuning results (aws-lambda-power-tuning against
  # dev's mock Pay.gov server).
  lambda_memory_sizes = {
    initPayment     = 512
    processPayment  = 256
    getDetails      = 512
    testCert        = 768
    healthCheck     = 768
    migrationRunner = 1024
  }
  github_oidc_provider_arn = "arn:aws:iam::802939326821:oidc-provider/token.actions.githubusercontent.com"
  github_org               = "ustaxcourt"
  github_repo              = "ustc-payment-portal"
  state_bucket_name        = "ustc-payment-portal-terraform-state-prod"
  state_object_keys = [
    "ustc-payment-portal/prod/*"
  ]
  name_prefix = "ustc-payment-portal-prod"
  payment_url = "https://www.pay.gov/tcsonline/payment.do"
  soap_url    = "https://tcs.pay.gov/services/TCSOnlineService/3.3/"

  # AWS account IDs allowed to invoke the API Gateway cross-account
  # Read from Secrets Manager - populated via AWS CLI/Console, not hardcoded
  allowed_client_account_ids = try(
    jsondecode(data.aws_secretsmanager_secret_version.allowed_account_ids.secret_string),
    []
  )

  monitoring_subscribers = nonsensitive(try(
    jsondecode(data.aws_ssm_parameter.monitoring_subscribers.value),
    []
  ))

  runbook_url          = "https://github.com/ustaxcourt/ustc-payment-portal/blob/main/docs/runbooks/lambda-error-alerts.md"
  throttle_runbook_url = "https://github.com/ustaxcourt/ustc-payment-portal/blob/main/docs/runbooks/api-gateway-throttle-alerts.md"


  # Prod threshold for 429s per 5 minute period before an alert is triggered.
  throttle_429_threshold = 1
}
