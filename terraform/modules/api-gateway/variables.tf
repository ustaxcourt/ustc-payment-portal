variable "environment" {
  description = "Environment where the API Gateway is being deployed"
  type        = string
}

variable "stage_name" {
  description = "Deployment stage name (e.g., dev)"
  type        = string
  default = "dev"
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

variable "allowed_origins" {
  description = "List of allowed origins for CORS. Must be exact domain URLs (e.g. https://example.com)"
  type        = list(string)

  validation {
    condition     = alltrue([for origin in var.allowed_origins : can(regex("^https://", origin))])
    error_message = "All allowed origins must start with https:// for security best practices."
  }
}
