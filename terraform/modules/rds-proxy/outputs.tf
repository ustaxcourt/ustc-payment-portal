output "endpoint" {
  description = "Connection endpoint (host:port) for the proxy. Matches the rds module's endpoint contract, so RDS_ENDPOINT can swap between module.rds.endpoint and module.rds_proxy.endpoint with no other changes."
  value       = "${aws_db_proxy.this.endpoint}:${var.db_port}"
}

output "host" {
  description = "Proxy host only (no port). aws_db_proxy returns the bare host, unlike aws_db_instance which includes the port."
  value       = aws_db_proxy.this.endpoint
}

output "port" {
  description = "Port clients use to reach the database through the proxy (matches the backend db_port)"
  value       = var.db_port
}

output "arn" {
  description = "ARN of the RDS Proxy"
  value       = aws_db_proxy.this.arn
}

output "proxy_name" {
  description = "Name of the RDS Proxy (useful for CloudWatch metric dimensions / alarms)"
  value       = aws_db_proxy.this.name
}

output "role_arn" {
  description = "ARN of the IAM role the proxy assumes to read the credentials secret"
  value       = aws_iam_role.proxy.arn
}
