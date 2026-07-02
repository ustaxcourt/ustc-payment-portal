output "vpc_id" {
  value       = module.networking.vpc_id
  description = "Lambda VPC ID"
}

output "public_subnet_id" {
  value       = module.networking.public_subnet_id
  description = "Public Subnet ID"
}

output "private_subnet_id" {
  value       = module.networking.private_subnet_id
  description = "Private Subnet ID (us-east-1a, back-compat — prefer private_subnet_ids)"
}

output "private_subnet_ids" {
  value       = module.networking.private_subnet_ids
  description = "All private subnet IDs (all AZs). Use for Lambda vpc_config to enable multi-AZ placement."
}

output "lambda_security_group_id" {
  value       = module.networking.lambda_security_group_id
  description = "Lambda Security Group ID"
}

output "lambda_role_arn" {
  value       = module.iam.lambda_role_arn
  description = "Lambda Role ARN"
}

output "lambda_role_name" {
  value       = module.iam.lambda_role_name
  description = "Lambda Role Name"
}

output "db_subnet_group_name" {
  value       = module.networking.db_subnet_group_name
  description = "RDS DB subnet group name"
}

output "rds_security_group_id" {
  value       = module.networking.rds_security_group_id
  description = "RDS security group ID"
}

output "proxy_security_group_id" {
  value       = module.networking.proxy_security_group_id
  description = "RDS Proxy Security Group ID"
}

output "proxy_subnet_ids" {
  value       = module.networking.proxy_subnet_ids
  description = "Private subnet IDs (both AZs) for placing the RDS Proxy"
}

output "ci_deployer_role_arn" {
  value       = module.iam.deployer_role_arn
  description = "CI/CD deployer role ARN (for GitHub Actions OIDC)"
}

output "ci_read_only_role_arn" {
  value       = module.iam.read_only_role_arn
  description = "Read-only CI role ARN (used by terraform-plan workflow today)"
}
