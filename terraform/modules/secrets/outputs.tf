#api_access_token to be removed in future stories
output "api_access_token_secret_id" {
  value       = aws_secretsmanager_secret.api_access_token.name
  description = "SecretId (name) for API access token"
}

output "cert_passphrase_secret_id" {
  value       = aws_secretsmanager_secret.cert_passphrase.name
  description = "SecretId (name) for cert passphrase"
}

output "paygov_dev_server_token_secret_id" {
  value       = aws_secretsmanager_secret.paygov_dev_server_token.name
  description = "SecretId (name) for Pay.gov dev server token"
}

output "private_key_secret_id" {
  value       = var.enable_mtls ? aws_secretsmanager_secret.private_key[0].name : null
  description = "SecretId for client private key PEM"
}
output "certificate_secret_id" {
  value       = var.enable_mtls ? aws_secretsmanager_secret.certificate[0].name : null
  description = "SecretId for client certificate PEM"
}

output "tcs_app_id_secret_id" {
  value       = aws_secretsmanager_secret.tcs_app_id.name
  description = "SecretId (name) for TCS Application ID"
}

output "rds_credentials_secret_id" {
  value       = aws_secretsmanager_secret.rds_credentials.id
  description = "SecretId (name) for RDS credentials"
}

output "rds_credentials_secret_arn" {
  value       = aws_secretsmanager_secret.rds_credentials.arn
  description = "ARN for RDS credentials secret"
}
