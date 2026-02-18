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
  description = "Private Subnet ID"
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
  description = "RDS DB Subnet Group Name (if private_subnet_cidr_2 is provided)"
}

output "rds_security_group_id" {
  value       = module.networking.rds_security_group_id
  description = "RDS Security Group ID (if private_subnet_cidr_2 is provided)"
}
