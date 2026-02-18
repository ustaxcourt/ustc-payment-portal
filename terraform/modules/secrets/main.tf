# Client cert and pvt key

# mTLS artifacts only when enabled
resource "aws_secretsmanager_secret" "private_key" {
  count                   = var.enable_mtls ? 1 : 0
  name                    = "${local.basepath}/${var.private_key_name}"
  description             = "Client private key PEM (${local.env})"
  recovery_window_in_days = 0
  tags                    = local.tags
}

resource "aws_secretsmanager_secret" "certificate" {
  count                   = var.enable_mtls ? 1 : 0
  name                    = "${local.basepath}/${var.certificate_name}"
  description             = "Client certificate PEM (${local.env})"
  recovery_window_in_days = 0
  tags                    = local.tags
}

# Secrets
resource "aws_secretsmanager_secret" "api_access_token" {
  name                    = "${local.basepath}/${var.api_access_token_name}"
  description             = "Pay.gov API access token (${local.env})"
  recovery_window_in_days = 0
  tags                    = local.tags
}

resource "aws_secretsmanager_secret" "cert_passphrase" {
  name                    = "${local.basepath}/${var.cert_passphrase_name}"
  description             = "Client certificate passphrase (${local.env})"
  recovery_window_in_days = 0
  tags                    = local.tags
}

resource "aws_secretsmanager_secret" "paygov_dev_server_token" {
  name                    = "${local.basepath}/${var.paygov_dev_server_token_name}"
  description             = "Pay.gov dev server token (${local.env})"
  recovery_window_in_days = 0
  tags                    = local.tags
}

resource "aws_secretsmanager_secret" "tcs_app_id" {
  name                    = "${local.basepath}/${var.tcs_app_id_name}"
  description             = "TCS Application ID (${local.env})"
  recovery_window_in_days = 0
  tags                    = local.tags
}

resource "aws_secretsmanager_secret" "rds_credentials" {
  name                    = "${local.basepath}/${var.rds_secret_name}"
  description             = "RDS credentials (${local.env})"
  recovery_window_in_days = 0
  tags                    = local.tags
}

# IAM for Lambda to read these secrets
data "aws_iam_policy_document" "lambda_secrets_read" {
  statement {
    sid       = "ReadSpecificSecrets"
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = local.secret_arns
  }
}

resource "aws_iam_role_policy" "lambda_secrets_read" {
  name   = "${var.project}-${local.env}-lambda-secrets-read"
  role   = local.lambda_exec_role_name
  policy = data.aws_iam_policy_document.lambda_secrets_read.json
}


