output "init_payment_function_arn" {
  description = "ARN of the initPayment Lambda function"
  value       = aws_lambda_function.init_payment.arn
}

output "init_payment_function_name" {
  description = "Name of the initPayment Lambda function"
  value       = aws_lambda_function.init_payment.function_name
}

output "init_payment_invoke_arn" {
  description = "Invoke ARN of the initPayment Lambda function"
  value       = aws_lambda_function.init_payment.invoke_arn
}

output "process_payment_function_arn" {
  description = "ARN of the processPayment Lambda function"
  value       = aws_lambda_function.process_payment.arn
}

output "process_payment_function_name" {
  description = "Name of the processPayment Lambda function"
  value       = aws_lambda_function.process_payment.function_name
}

output "process_payment_invoke_arn" {
  description = "Invoke ARN of the processPayment Lambda function"
  value       = aws_lambda_function.process_payment.invoke_arn
}

output "get_details_function_arn" {
  description = "ARN of the getDetails Lambda function"
  value       = aws_lambda_function.get_details.arn
}

output "get_details_function_name" {
  description = "Name of the getDetails Lambda function"
  value       = aws_lambda_function.get_details.function_name
}

output "get_details_invoke_arn" {
  description = "Invoke ARN of the getDetails Lambda function"
  value       = aws_lambda_function.get_details.invoke_arn
}

output "test_cert_function_arn" {
  description = "ARN of the testCert Lambda function"
  value       = aws_lambda_function.test_cert.arn
}

output "test_cert_function_name" {
  description = "Name of the testCert Lambda function"
  value       = aws_lambda_function.test_cert.function_name
}

output "test_cert_invoke_arn" {
  description = "Invoke ARN of the testCert Lambda function"
  value       = aws_lambda_function.test_cert.invoke_arn
}