locals {
  aws_region    = "us-east-1"
  environment   = var.namespace
  node_env      = "development"
  mtls_enabled  = false
  custom_domain = "dev-payments.ustaxcourt.gov"
  # Payment Lambdas: initPayment, processPayment, getDetails, testCert
  # Needs full secrets + RDS. mTLS vars included when enabled.
  rds_endpoint   = local.environment == "dev" ? module.rds[0].endpoint : data.aws_ssm_parameter.dev_rds_endpoint[0].value
  rds_secret_arn = local.environment == "dev" ? module.secrets.rds_credentials_secret_arn : data.aws_ssm_parameter.dev_rds_secret_arn[0].value
  rds_db_name    = local.environment == "dev" ? "paymentportal" : "paymentportal_${replace(local.environment, "-", "_")}"

  lambda_env_payment = merge({
    NODE_ENV                           = local.node_env
    PAYMENT_URL                        = local.payment_url
    SOAP_URL                           = local.soap_url
    CERT_PASSPHRASE_SECRET_ID          = module.secrets.cert_passphrase_secret_id
    PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID = module.secrets.paygov_dev_server_token_secret_id
    CLIENT_PERMISSIONS_SECRET_ID       = module.secrets.client_permissions_secret_id
    RDS_ENDPOINT                       = local.rds_endpoint
    RDS_SECRET_ARN                     = local.rds_secret_arn
    RDS_DB_NAME                        = local.rds_db_name
  }, local.mtls_enabled ? {
    PRIVATE_KEY_SECRET_ID = module.secrets.private_key_secret_id
    CERTIFICATE_SECRET_ID = module.secrets.certificate_secret_id
  } : {})

  # Dashboard Lambdas: getAllTransactions, getTransactionsByStatus, getTransactionPaymentStatus
  # authorization=NONE — must not receive payment secrets.
  lambda_env_dashboard = {
    NODE_ENV                 = local.node_env
    RDS_ENDPOINT             = local.rds_endpoint
    RDS_SECRET_ARN           = local.rds_secret_arn
    RDS_DB_NAME              = local.rds_db_name
    DASHBOARD_ALLOWED_ORIGIN = local.dashboard_allowed_origin
  }

  # Migration Lambda: migrationRunner
  # Needs RDS only — no payment secrets, no CORS origin.
  # RDS_MASTER_SECRET_ARN uses the same admin credentials — required for CREATE/DROP DATABASE.
  lambda_env_migration = {
    NODE_ENV              = local.node_env
    RDS_ENDPOINT          = local.rds_endpoint
    RDS_SECRET_ARN        = local.rds_secret_arn
    RDS_MASTER_SECRET_ARN = local.rds_secret_arn
    RDS_DB_NAME           = local.rds_db_name
  }

  lambda_env_by_function = {
    initPayment                 = local.lambda_env_payment
    processPayment              = local.lambda_env_payment
    getDetails                  = local.lambda_env_payment
    testCert                    = local.lambda_env_payment
    getAllTransactions           = local.lambda_env_dashboard
    getTransactionsByStatus     = local.lambda_env_dashboard
    getTransactionPaymentStatus = local.lambda_env_dashboard
    migrationRunner             = local.lambda_env_migration
  }
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

  # Origin allowed to call dashboard endpoints from the browser.
  # then lock back to the custom domain once confirmed working.
  dashboard_allowed_origin = "https://dashboard.dev-payments.ustaxcourt.gov"

  # AWS account IDs allowed to invoke the API Gateway cross-account
  # Read from Secrets Manager - populated via AWS CLI/Console, not hardcoded
  allowed_client_account_ids = try(
    jsondecode(data.aws_secretsmanager_secret_version.allowed_account_ids.secret_string),
    []
  )
}

