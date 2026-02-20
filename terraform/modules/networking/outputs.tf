output "vpc_id" {
  value       = aws_vpc.lambda_vpc.id
  description = "Lambda VPC ID"
}

output "public_subnet_id" {
  value       = aws_subnet.public_subnet.id
  description = "Public Subnet ID"
}

output "private_subnet_id" {
  value       = aws_subnet.private_subnet.id
  description = "Private Subnet ID"
}

output "lambda_security_group_id" {
  value       = aws_security_group.lambda.id
  description = "Lambda Security Group ID"
}

output "db_subnet_group_name" {
  value       = var.private_subnet_cidr_2 != "" ? aws_db_subnet_group.rds[0].name : null
  description = "RDS DB Subnet Group Name"
}

output "rds_security_group_id" {
  value       = var.private_subnet_cidr_2 != "" ? aws_security_group.rds[0].id : null
  description = "RDS Security Group ID"
}
