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

