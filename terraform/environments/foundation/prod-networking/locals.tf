locals {
  aws_region               = "us-east-1"
  environment              = "prod"
  node_env                 = "production"
  app_env                  = "prod"
  name_prefix              = "ustc-payment-portal-prod"
  github_oidc_provider_arn = "arn:aws:iam::802939326821:oidc-provider/token.actions.githubusercontent.com"
  github_org               = "ustaxcourt"
  github_repo              = "ustc-payment-portal"
}
