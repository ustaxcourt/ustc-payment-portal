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
 value = module.api.api_gateway_url
 description = "API Gateway URL for the production environment"
}
output "api_access_token_secret_id" {
 value = module.secrets.api_access_token_secret_id
 description = "Secret ID for API access token"
}
output "tcs_app_id_secret_id" {
 value = module.secrets.tcs_app_id_secret_id
 description = "Secret ID for TCS App ID"
}

output "rds_endpoint" {
  value       = module.rds.endpoint
  description = "RDS database endpoint (host:port)"
}

output "rds_master_secret_arn" {
  value       = module.rds.master_user_secret_arn
  description = "ARN of AWS-managed Secrets Manager secret containing RDS master credentials"
}
