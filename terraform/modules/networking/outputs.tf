output "vpc_id" {
  value       = aws_vpc.lambda_vpc.id
  description = "Lambda VPC ID"
}

output "public_subnet_id" {
  value       = aws_subnet.public[var.availability_zones[0]].id
  description = "Public Subnet ID (first configured AZ, back-compat)"
}

output "private_subnet_id" {
  value       = aws_subnet.private[var.availability_zones[0]].id
  description = "Private Subnet ID (first configured AZ, back-compat — prefer private_subnet_ids for new consumers)"
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
