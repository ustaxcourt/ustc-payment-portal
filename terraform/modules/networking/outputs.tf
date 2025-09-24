output "vpc_id" {
  value       = aws_vpc.lambda_vpc.id
  description = "Lambda VPC ID"
}

output "public_subnet_id" {
  value       = aws_subnet.public_subnet.id
  description = "Public Subnet ID"
}

output "private_subnet_id" {
  value = aws_subnet.private_subnet.id
}

output "lambda_security_group_id" {
  value = aws_security_group.lambda.id
}

