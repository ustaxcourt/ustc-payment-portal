# Dev service token stored in AWS Secrets Manager
# This is used to set the Lambda env var ACCESS_TOKEN via Terraform.

resource "random_password" "access_token" {
  length  = 48
  special = true
}

resource "aws_secretsmanager_secret" "access_token" {
  name        = local.access_token_secret_name
  description = "USTC Payment portal Server ${env.environment} access token"
}

resource "aws_secretsmanager_secret_version" "access_token" {
  secret_id     = aws_secretsmanager_secret.access_token.id
  secret_string = random_password.access_token.result
}