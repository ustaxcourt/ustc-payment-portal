mock_provider "aws" {}

override_data {
  target = data.aws_iam_policy_document.assume_role
  values = {
    json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":[\"sts:AssumeRole\"],\"Principal\":{\"Service\":[\"lambda.amazonaws.com\"]}}]}"
  }
}

run "role_names_and_outputs" {
  command = plan

  variables {
    name_prefix              = "ustc-dev"
    lambda_name_prefix       = "ustc-payment-portal-dev"
    environment              = "dev"
    deploy_role_name         = "ustc-payment-portal-dev-deployer"
    read_only_role_name      = "ustc-payment-portal-dev-read-only"
    github_oidc_provider_arn = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
    github_org               = "ustaxcourt"
    github_repo              = "ustc-payment-portal"
    state_bucket_name        = "ustc-payment-portal-terraform-state-dev"
    project_name             = "ustc-payment-portal"
    aws_region               = "us-east-1"
  }

  assert {
    condition     = output.lambda_role_name == "ustc-dev-lambda-exec"
    error_message = "lambda role name should follow name_prefix convention"
  }

  assert {
    condition     = output.deployer_role_name == "ustc-payment-portal-dev-deployer"
    error_message = "deployer role output should match configured role name"
  }

  assert {
    condition     = output.read_only_role_name == "ustc-payment-portal-dev-read-only"
    error_message = "read-only role output should match configured role name"
  }

  assert {
    condition     = aws_iam_role.lambda_exec.name == "ustc-dev-lambda-exec"
    error_message = "lambda execution role resource should use name_prefix convention"
  }
}
