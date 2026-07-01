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

output "proxy_security_group_id" {
  value       = var.enable_proxy && var.private_subnet_cidr_2 != "" ? aws_security_group.proxy[0].id : null
  description = "RDS Proxy Security Group ID (null when the proxy is disabled or no second subnet exists)"
}

output "proxy_subnet_ids" {
  value       = var.private_subnet_cidr_2 != "" ? [aws_subnet.private_subnet.id, aws_subnet.private_subnet_2[0].id] : [aws_subnet.private_subnet.id]
  description = "Private subnet IDs across both AZs (when configured) for placing the RDS Proxy"
}
