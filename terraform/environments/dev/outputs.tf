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

# output "lambda_role_name" {
#   value = module.iam.lambda_role_name
# }

# output "api_gateway_execution_arn" {
#   value = module.api.api_gateway_execution_arn
# }