output "function_arns" {
  description = "Map of Lambda function ARNs"
  value       = { for k, v in aws_lambda_function.functions : k => v.arn }
}

output "function_names" {
  description = "Map of Lambda function names"
  value       = { for k, v in aws_lambda_function.functions : k => v.function_name }
}

output "function_invoke_arns" {
  description = "Map of Lambda function invoke ARNs"
  value       = { for k, v in aws_lambda_function.functions : k => v.invoke_arn }
}

# Individual outputs for backward compatibility
output "init_payment_function_arn" {
  description = "ARN of the initPayment Lambda function"
  value       = aws_lambda_function.functions["initPayment"].arn
}

output "init_payment_function_name" {
  description = "Name of the initPayment Lambda function"
  value       = aws_lambda_function.functions["initPayment"].function_name
}

output "init_payment_invoke_arn" {
  description = "Invoke ARN of the initPayment Lambda function"
  value       = aws_lambda_function.functions["initPayment"].invoke_arn
}

output "process_payment_function_arn" {
  description = "ARN of the processPayment Lambda function"
  value       = aws_lambda_function.functions["processPayment"].arn
}

output "process_payment_function_name" {
  description = "Name of the processPayment Lambda function"
  value       = aws_lambda_function.functions["processPayment"].function_name
}

output "process_payment_invoke_arn" {
  description = "Invoke ARN of the processPayment Lambda function"
  value       = aws_lambda_function.functions["processPayment"].invoke_arn
}

output "get_details_function_arn" {
  description = "ARN of the getDetails Lambda function"
  value       = aws_lambda_function.functions["getDetails"].arn
}

output "get_details_function_name" {
  description = "Name of the getDetails Lambda function"
  value       = aws_lambda_function.functions["getDetails"].function_name
}

output "get_details_invoke_arn" {
  description = "Invoke ARN of the getDetails Lambda function"
  value       = aws_lambda_function.functions["getDetails"].invoke_arn
}

output "test_cert_function_arn" {
  description = "ARN of the testCert Lambda function"
  value       = aws_lambda_function.functions["testCert"].arn
}

output "test_cert_function_name" {
  description = "Name of the testCert Lambda function"
  value       = aws_lambda_function.functions["testCert"].function_name
}

output "test_cert_invoke_arn" {
  description = "Invoke ARN of the testCert Lambda function"
  value       = aws_lambda_function.functions["testCert"].invoke_arn
}