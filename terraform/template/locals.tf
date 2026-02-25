locals {
  environment = var.environment
  bucket_name = "ustc-payment-portal-${var.environment}"
  common_tags = {
    Environment = var.environment
    Project     = var.project_name
  }
  custom_domain               = var.custom_domain
  access_token_secret_name    = "ustc/pay-gov/${var.environment}/access-token"
  rds_credentials_secret_name = "ustc/pay-gov/${var.environment}/rds-credentials"
}
