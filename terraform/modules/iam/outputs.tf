output "lambda_role_arn" {
  description = "ARN of the Lambda execution role"
  value       = aws_iam_role.lambda_exec.arn
}

output "lambda_role_name" {
  description = "Name of the Lambda execution role"
  value       = aws_iam_role.lambda_exec.name
}

output "role_name" {
  value       = aws_iam_role.github_actions_deployer.name
  description = "CI/CD deployer role name"
}

output "role_arn" {
  value       = aws_iam_role.github_actions_deployer.arn
  description = "CI/CD deployer role ARN"
}

output "read_only_role_name" {
  value       = aws_iam_role.github_actions_read_only.name
  description = "Read-only CI role name (used by terraform-plan workflow today)"
}

output "read_only_role_arn" {
  value       = aws_iam_role.github_actions_read_only.arn
  description = "Read-only CI role ARN (used by terraform-plan workflow today)"
}

