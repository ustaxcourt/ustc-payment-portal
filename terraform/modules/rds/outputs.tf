output "endpoint" {
  description = "Connection endpoint (host:port) for the RDS instance"
  value       = aws_db_instance.main.endpoint
}

output "port" {
  description = "Port the database is listening on (e.g. 5432)"
  value       = aws_db_instance.main.port
}

output "master_user_secret_arn" {
  description = "ARN of the Secrets Manager secret created by AWS when manage_master_user_password is true"
  value       = var.manage_master_user_password ? aws_db_instance.main.master_user_secret[0].secret_arn : null
}
