variable "environment" {
  type = string
}

variable "project" {
  type    = string
  default = "ustc-payment-portal"
}

variable "lambda_exec_role_arn" {
  type = string
}

variable "enable_mtls" {
  type    = bool
  default = true
}

variable "private_key_name" {
  type    = string
  default = "private-key-pem"
}

variable "certificate_name" {
  type    = string
  default = "certificate-pem"
}

variable "api_access_token_name" {
  type    = string
  default = "access-token"
}

variable "cert_passphrase_name" {
  type    = string
  default = "cert-passphrase"
}

variable "paygov_dev_server_token_name" {
  type    = string
  default = "pay-gov-dev-server-token"
}

variable "tcs_app_id_name" {
  type    = string
  default = "tcs-app-id"
}

variable "tags" {
  type    = map(string)
  default = {}
}

variable "rds_secret_name" {
  description = "Name of the Secrets Manager secret that stores RDS credentials"
  type        = string
}

variable "recovery_window_in_days" {
  description = "Days to retain deleted secrets before permanent removal (0=immediate, 7-30 for recoverability)"
  type        = number
  default     = 30
  validation {
    condition     = var.recovery_window_in_days == 0 || (var.recovery_window_in_days >= 7 && var.recovery_window_in_days <= 30)
    error_message = "Must be 0 (immediate) or between 7-30 days."
  }
}
