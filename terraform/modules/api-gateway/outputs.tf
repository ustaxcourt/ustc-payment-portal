output "rest_api_id" {
  value = aws_api_gateway_rest_api.rest.id
}

output "api_gateway_execution_arn" {
  value = aws_api_gateway_rest_api.rest.execution_arn
}

output "stage_name" {
  value = aws_api_gateway_stage.stage.stage_name
}

output "api_gateway_url" {
  value       = aws_api_gateway_stage.stage.invoke_url
  description = "Base URL for API Gateway stage"
}

output "custom_domain_url" {
  value       = var.custom_domain != "" ? "https://${var.custom_domain}" : null
  description = "Custom domain URL for the API, if configured"
}

output "access_log_group_name" {
  value       = aws_cloudwatch_log_group.access_logs.name
  description = "Name of the CloudWatch log group receiving API Gateway access logs."
}

