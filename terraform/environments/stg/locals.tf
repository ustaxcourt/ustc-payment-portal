locals {
  aws_region   = "us-east-1"
  environment  = "stg"
  github_oidc_provider_arn = "arn:aws:iam::747103385969:oidc-provider/token.actions.githubusercontent.com"
  github_org = "ustaxcourt"
  github_repo = "ustc-payment-portal"
  state_bucket_name     = "ustc-payment-portal-terraform-state-stg"
  state_lock_table_name = "ustc-payment-portal-terraform-locks-stg"
  state_object_keys = [
    "ustc-payment-portal/stg/networking.tfstate",
    "ustc-payment-portal/stg/stg.tfstate",
  ]
  lambda_exec_role_arn = "arn:aws:iam::747103385969:role/ustc-payment-portal-stg-lambda-exec"
  name_prefix = "ustc-payment-processor-stg"
}

