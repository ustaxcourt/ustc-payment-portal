output "vpc_id" {
  value       = module.networking.vpc_id
  description = "Lambda VPC ID"
}

output "public_subnet_id" {
  value       = module.networking.public_subnet_id
  description = "Public Subnet ID"
}

output "private_subnet_id" {
  value = module.networking.private_subnet_id
}

output "lambda_security_group_id" {
  value = module.networking.lambda_security_group_id
}

output "lambda_role_arn" {
  value = module.iam.lambda_role_arn
}

output "lambda_role_name" {
  value = module.iam.lambda_role_name
}
