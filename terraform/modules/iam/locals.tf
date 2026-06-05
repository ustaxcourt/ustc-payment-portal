locals {
  # Values used by deployer/read-only role definitions.
  github_sub               = "repo:${var.github_org}/${var.github_repo}:*"
  github_oidc_provider_arn = var.github_oidc_provider_arn

  tf_state_bucket_name = var.state_bucket_name

  lambda_exec_role_arn = var.lambda_exec_role_arn
  name_prefix          = var.name_prefix
  lambda_name_prefix   = "${var.project_name}-${var.environment}"

  aws_region          = var.aws_region
  project_name        = var.project_name
  environment         = var.environment
  deploy_role_name    = var.deploy_role_name
  read_only_role_name = var.read_only_role_name
}
