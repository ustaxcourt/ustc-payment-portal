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
    value = aws_api_gateway_stage.stage.invoke_url
    description = "Base URL for API Gateway stage"
}

