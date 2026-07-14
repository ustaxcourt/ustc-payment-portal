output "vpc_id" {
  value       = aws_vpc.lambda_vpc.id
  description = "Lambda VPC ID"
}

output "public_subnet_id" {
  value       = aws_subnet.public["us-east-1a"].id
  description = "Public Subnet ID (us-east-1a, back-compat)"
}

output "private_subnet_id" {
  value       = aws_subnet.private["us-east-1a"].id
  description = "Private Subnet ID (us-east-1a, back-compat — prefer private_subnet_ids for new consumers)"
}

output "private_subnet_ids" {
  value       = [for az in sort(keys(aws_subnet.private)) : aws_subnet.private[az].id]
  description = "All private subnet IDs, sorted by AZ. Use this for Lambda vpc_config to enable multi-AZ placement."
}

output "lambda_security_group_id" {
  value       = aws_security_group.lambda.id
  description = "Lambda Security Group ID"
}

output "db_subnet_group_name" {
  value       = aws_db_subnet_group.rds.name
  description = "RDS DB Subnet Group Name"
}

output "rds_security_group_id" {
  value       = aws_security_group.rds.id
  description = "RDS Security Group ID"
}

output "proxy_security_group_id" {
  value       = var.enable_proxy ? aws_security_group.proxy[0].id : null
  description = "RDS Proxy Security Group ID (null when the proxy is disabled)"
}

output "proxy_subnet_ids" {
  value       = [for az in sort(keys(aws_subnet.private)) : aws_subnet.private[az].id]
  description = "All private subnet IDs for placing the RDS Proxy (all AZs, sorted)."
}
