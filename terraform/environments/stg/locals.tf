locals {
  aws_region    = "us-east-1"
  environment   = "stg"
  node_env      = "production"
  app_env       = "stg"
  mtls_enabled  = true
  custom_domain = "stg-payments.ustaxcourt.gov"
  rds_db_name   = "paymentportal"
  lambda_env_payment = merge({
    NODE_ENV                           = local.node_env
    APP_ENV                            = local.app_env
    PAYMENT_URL                        = local.payment_url
    SOAP_URL                           = local.soap_url
    CERT_PASSPHRASE_SECRET_ID          = module.secrets.cert_passphrase_secret_id
    PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID = module.secrets.paygov_dev_server_token_secret_id
    CLIENT_PERMISSIONS_SECRET_ID       = module.secrets.client_permissions_secret_id
    RDS_ENDPOINT                       = module.rds.endpoint
    RDS_SECRET_ARN                     = module.rds.master_user_secret_arn
    RDS_DB_NAME                        = local.rds_db_name
    }, local.mtls_enabled ? {
    PRIVATE_KEY_SECRET_ID = module.secrets.private_key_secret_id
    CERTIFICATE_SECRET_ID = module.secrets.certificate_secret_id
  } : {})

  # Migration Lambda: migrationRunner
  # Needs RDS only — no payment secrets. RDS_MASTER_SECRET_ARN must be the admin
  # creds for CREATE/DROP DATABASE during knex migrations.
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
    migrationRunner = local.lambda_env_migration
  }
  github_oidc_provider_arn = "arn:aws:iam::747103385969:oidc-provider/token.actions.githubusercontent.com"
  github_org               = "ustaxcourt"
  github_repo              = "ustc-payment-portal"
  state_bucket_name        = "ustc-payment-portal-terraform-state-stg"
  state_object_keys = [
    "ustc-payment-portal/stg/*"
  ]
  lambda_exec_role_arn = "arn:aws:iam::747103385969:role/ustc-payment-portal-stg-lambda-exec"
  name_prefix          = "ustc-payment-portal-stg"
  payment_url          = "https://qa.pay.gov/tcsonline/payment.do"
  soap_url             = "https://qa.tcs.pay.gov/services/TCSOnlineService/3.3/"

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

  # Stg threshold for 429s per 5 minute period before an alert is triggered.
  throttle_429_threshold = 3
}

