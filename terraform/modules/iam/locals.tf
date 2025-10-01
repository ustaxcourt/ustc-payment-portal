locals {
  github_sub = "repo:${var.github_org}/${var.github_repo}:*"

  github_oidc_provider_arn = var.github_oidc_provider_arn

  tf_state_bucket_name  = var.state_bucket_name
  tf_lock_table_name    = var.state_lock_table_name
  state_object_keys     = var.state_object_keys

  lambda_exec_role_arn  = var.lambda_exec_role_arn
  name_prefix    = var.name_prefix
  lambda_name_prefix = "${var.project_name}-${var.environment}"

  aws_region    = var.aws_region
  project_name  = var.project_name
  environment   = var.environment
  deploy_role_name = var.deploy_role_name
}

