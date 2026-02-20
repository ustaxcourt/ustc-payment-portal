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

output "db_subnet_group_name" {
  value       = module.networking.db_subnet_group_name
  description = "RDS DB subnet group name"
}

output "rds_security_group_id" {
  value       = module.networking.rds_security_group_id
  description = "RDS security group ID"
}
