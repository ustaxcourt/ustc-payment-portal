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

output "api_gateway_url" {
  value       = module.api.api_gateway_url
  description = "Base URL of the API Gateway for integration tests"
}

output "hosted_zone_nameservers" {
  # Returns [] for PR workspaces — the hosted zone is only created for the base dev environment,
  # not for ephemeral per-PR environments (aws_route53_zone.this uses count and is skipped in PR workspaces)
  value       = local.environment == "dev" ? aws_route53_zone.this[0].name_servers : []
  description = "Nameservers for the hosted zone — share with ISD to set NS delegation records in ustaxcourt.gov"
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


output "test_unauthorized_role_arn" {
  value       = aws_iam_role.test_unauthorized.arn
  description = "ARN of the test role for Lambda-level authorization testing (intentionally NOT in client-permissions)"
}

output "artillery_load_test_role_arn" {
  value       = local.enable_artillery_load_test ? aws_iam_role.artillery_load_test[0].arn : null
  description = "IAM role ARN for Artillery run-lambda in the active dev or PR workspace (--lambda-role-arn)"
}

output "migration_runner_function_name" {
  description = "Name of the migration runner Lambda function"
  value       = module.lambda.function_names["migrationRunner"]
}
