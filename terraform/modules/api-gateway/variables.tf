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
}

