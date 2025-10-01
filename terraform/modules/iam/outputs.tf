output "lambda_role_arn" {
  description = "ARN of the Lambda execution role"
  value       = var.create_lambda_exec_role ? aws_iam_role.lambda_exec[0].arn : null
}

output "lambda_role_name" {
  description = "Name of the Lambda execution role"
  value       = var.create_lambda_exec_role ? aws_iam_role.lambda_exec[0].name : null
}

output "role_name" {
  value       = aws_iam_role.github_actions_deployer.name
  description = "CI/CD deployer role name"
}

output "role_arn" {
  value       = aws_iam_role.github_actions_deployer.arn
  description = "CI/CD deployer role ARN"
}

