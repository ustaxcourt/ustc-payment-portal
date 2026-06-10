# Client cert and pvt key

# mTLS artifacts only when enabled
resource "aws_secretsmanager_secret" "private_key" {
  count                   = var.enable_mtls ? 1 : 0
  name                    = "${local.basepath}/${var.private_key_name}"
  description             = "Client private key PEM (${local.env})"
  recovery_window_in_days = var.recovery_window_in_days
  tags                    = local.tags
}

resource "aws_secretsmanager_secret" "certificate" {
  count                   = var.enable_mtls ? 1 : 0
  name                    = "${local.basepath}/${var.certificate_name}"
  description             = "Client certificate PEM (${local.env})"
  recovery_window_in_days = var.recovery_window_in_days
  tags                    = local.tags
}

# Secrets
resource "aws_secretsmanager_secret" "cert_passphrase" {
  name                    = "${local.basepath}/${var.cert_passphrase_name}"
  description             = "Client certificate passphrase (${local.env})"
  recovery_window_in_days = var.recovery_window_in_days
  tags                    = local.tags
}

resource "aws_secretsmanager_secret" "paygov_dev_server_token" {
  name                    = "${local.basepath}/${var.paygov_dev_server_token_name}"
  description             = "Pay.gov dev server token (${local.env})"
  recovery_window_in_days = var.recovery_window_in_days
  tags                    = local.tags
}

resource "aws_secretsmanager_secret" "tcs_app_id" {
  name                    = "${local.basepath}/${var.tcs_app_id_name}"
  description             = "TCS Application ID (${local.env})"
  recovery_window_in_days = var.recovery_window_in_days
  tags                    = local.tags
}

resource "aws_secretsmanager_secret" "rds_credentials" {
  count                   = var.create_rds_secret ? 1 : 0
  name                    = "${local.basepath}/${var.rds_secret_name}"
  description             = "RDS credentials (${local.env})"
  recovery_window_in_days = var.recovery_window_in_days
  tags                    = local.tags
}

resource "aws_secretsmanager_secret" "client_permissions" {
  name                    = "${local.basepath}/${var.client_permissions_name}"
  description             = "Authorized client IAM role ARNs and allowed fee keys (${local.env})"
  recovery_window_in_days = var.recovery_window_in_days
  tags                    = local.tags
}

# Seed client_permissions with an empty array so Lambda doesn't 500 on first deploy.
# Actual client entries should be added via AWS CLI/Console after deployment.
resource "aws_secretsmanager_secret_version" "client_permissions_initial" {
  secret_id     = aws_secretsmanager_secret.client_permissions.id
  secret_string = "[]"

  lifecycle {
    ignore_changes = [secret_string]
  }
}

resource "aws_secretsmanager_secret" "allowed_account_ids" {
  name                    = "${local.basepath}/${var.allowed_account_ids_name}"
  description             = "JSON array of AWS account IDs allowed to invoke the API Gateway cross-account (${local.env})"
  recovery_window_in_days = var.recovery_window_in_days
  tags                    = local.tags
}

# Seed the allowed_account_ids secret with an empty array so Terraform can read it
# Actual account IDs should be added via AWS CLI/Console after deployment
resource "aws_secretsmanager_secret_version" "allowed_account_ids_initial" {
  secret_id     = aws_secretsmanager_secret.allowed_account_ids.id
  secret_string = "[]"

  lifecycle {
    ignore_changes = [secret_string]
  }
}
