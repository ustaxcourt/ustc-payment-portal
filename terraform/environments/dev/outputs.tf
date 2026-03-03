output "lambda_function_arns" {
  description = "Map of Lambda function ARNs keyed by function name"
  value       = module.lambda.function_arns
}

output "lambda_function_names" {
  description = "Map of Lambda function names keyed by function name"
  value       = module.lambda.function_names
}

output "lambda_function_invoke_arns" {
  description = "Map of Lambda function invoke ARNs keyed by function name"
  value       = module.lambda.function_invoke_arns
}

output "cicd_role_arn" {
  value       = module.iam_cicd.role_arn
  description = "ARN of the GitHub OIDC CI/CD deployer role"
}

output "api_gateway_url" {
  value       = module.api.api_gateway_url
  description = "Base URL of the API Gateway for integration tests"
}

output "cert_passphrase_secret_id" {
  value       = module.secrets.cert_passphrase_secret_id
  description = "Secret ID for certificate passphrase"
}

output "paygov_dev_server_token_secret_id" {
  value       = module.secrets.paygov_dev_server_token_secret_id
  description = "Secret ID for Pay.gov dev server token"
}

output "tcs_app_id_secret_id" {
  value       = module.secrets.tcs_app_id_secret_id
  description = "Secret ID for TCS Application ID"
}

output "client_permissions_secret_id" {
  value       = module.secrets.client_permissions_secret_id
  description = "Secret ID for client permissions (authorized IAM role ARNs and allowed fee IDs)"
}

output "allowed_account_ids_secret_id" {
  value       = module.secrets.allowed_account_ids_secret_id
  description = "Secret ID for allowed account IDs (cross-account API Gateway access)"
}

output "rds_endpoint" {
  value       = local.environment == "dev" ? module.rds[0].endpoint : null
  description = "RDS database endpoint (host:port)"
}

output "build_artifacts_bucket_name" {
  value       = local.environment == "dev" ? module.artifacts_bucket[0].bucket_name : data.aws_s3_bucket.existing_artifacts[0].bucket
  description = "Name for build artifacts bucket"
}

output "build_artifacts_bucket_arn" {
  value       = local.environment == "dev" ? module.artifacts_bucket[0].bucket_arn : data.aws_s3_bucket.existing_artifacts[0].arn
  description = "ARN for build artifacts bucket"
}

output "test_unauthorized_role_arn" {
  value       = aws_iam_role.test_unauthorized.arn
  description = "ARN of the test role for Lambda-level authorization testing (intentionally NOT in client-permissions)"
}
