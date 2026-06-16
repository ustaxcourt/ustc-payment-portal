
variable "enable_public_dashboard" {
  description = "If true, enables unauthenticated public access to dashboard endpoints (GET/OPTIONS for /transactions, /transactions/{status}, /transaction-payment-status). Should only be true in dev."
  type        = bool
  default     = false
}

variable "environment" {
  description = "Environment where the API Gateway is being deployed"
  type        = string
}

variable "stage_name" {
  description = "Deployment stage name (e.g., dev)"
  type        = string
  default     = "dev"
}

variable "lambda_function_arns" {
  description = "Map of Lambda function ARNs keyed by function name: initPayment, processPayment, getDetails, testCert"
  type        = map(string)
}

variable "common_tags" {
  description = "Tags to apply to API resources"
  type        = map(string)
  default     = {}
}

variable "allowed_account_ids" {
  description = "List of AWS account IDs allowed to invoke the API Gateway via cross-account IAM access. The deploying account is always allowed."
  type        = list(string)
  default     = []
}

variable "custom_domain" {
  description = "Custom domain name for the API (e.g. dev-payments.ustaxcourt.gov). Leave empty to skip domain setup."
  type        = string
  default     = ""
}

variable "certificate_arn" {
  description = "ARN of the ACM certificate for the custom domain. Required when custom_domain is set."
  type        = string
  default     = ""
}

variable "route53_zone_id" {
  description = "Route53 hosted zone ID for the domain. Required when custom_domain is set."
  type        = string
  default     = ""
}

variable "dashboard_allowed_origin" {
  description = "Origin allowed to call dashboard endpoints via CORS (e.g. https://dashboard.dev-payments.ustaxcourt.gov). Must be explicitly set — no default to prevent accidentally opening CORS to all origins."
  type        = string
  default     = ""
}

variable "log_retention_days" {
  description = "Retention period in days for the API Gateway access log group."
  type        = number
  default     = 30

  validation {
    condition = contains([
      1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653,
    ], var.log_retention_days)
    error_message = "log_retention_days must be a valid CloudWatch Logs retention value (e.g., 1, 3, 5, 7, 14, 30, 60, ...)."
  }
}

variable "enable_access_logging" {
  description = "Whether to enable CloudWatch access logging on the stage. Requires aws_api_gateway_account to be configured in the AWS account. Set to false in environments where that account-level resource is not present."
  type        = bool
  default     = true
}

variable "enable_per_endpoint_throttling" {
  description = "Whether to apply per-endpoint throttle overrides for /init, /process, and /details. When false, all routes fall back to the stage-wide default. Set to false in dev/PR environments to avoid throttling during testing."
  type        = bool
  default     = true
}

