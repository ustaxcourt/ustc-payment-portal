output "endpoint" {
  description = "Connection endpoint (host:port) for the RDS instance"
  value       = aws_db_instance.main.endpoint
}

output "port" {
  description = "Port the database is listening on (e.g. 5432)"
  value       = aws_db_instance.main.port
}
