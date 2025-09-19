locals {
  environment              = "dev"
  custom_domain            = "pay-gov-dev.ustaxcourt.gov"
  access_token_secret_name = "ustc/pay-gov/dev/access-token"
  certificate_arn          = "arn:aws:acm:us-east-1:803663093283:certificate/bbe4dc79-cb7e-4c5a-9125-dc89995a82f0"
  github_oidc_provider_arn = "arn:aws:iam::803663093283:oidc-provider/token.actions.githubusercontent.com"
  deploy_role_name         = "ustc-github-actions-oidc-deployer-role"
  github_repo              = "ustc-pay-gov-test-server"
  tf_state_bucket_name     = "ustc-pay-gov-terraform-state"
  tf_lock_table_name       = "ustc-pay-gov-terraform-locks"

  # Derived locals used across modules
  common_tags = {
    Project     = var.project_name
    Environment = local.environment
    ManagedBy   = "terraform"
  }

  bucket_name = "${local.environment}-${var.project_name}"
}


module 