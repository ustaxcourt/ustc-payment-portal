locals {
  aws_region   = "us-east-1"
  environment  = "dev"
  github_oidc_provider_arn = "arn:aws:iam::723609007960:oidc-provider/token.actions.githubusercontent.com"
  github_org = "ustaxcourt"
  github_repo = "ustc-payment-portal"
  state_bucket_name     = "ustc-payment-portal-terraform-state-dev"
  state_lock_table_name = "ustc-payment-portal-terraform-locks-dev"
  state_object_keys = [
    "ustc-payment-portal/dev/networking.tfstate",
    "ustc-payment-portal/dev/dev.tfstate",
  ]
  lambda_exec_role_arn = "arn:aws:iam::723609007960:role/ustc-payment-portal-dev-lambda-exec"
  name_prefix = "ustc-payment-processor-dev"
}

