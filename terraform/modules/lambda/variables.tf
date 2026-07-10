variable "function_name_prefix" {
  description = "Prefix for Lambda function names"
  type        = string
  default     = "ustc-payment-processor"
}

variable "lambda_execution_role_arn" {
  description = "ARN of the Lambda execution role from IAM module"
  type        = string
}

variable "runtime" {
  description = "Lambda runtime"
  type        = string
  default     = "nodejs22.x"
}

variable "payment_lambda_timeout" {
  description = "Timeout (seconds) shared by the payment-flow Lambdas (initPayment, processPayment, getDetails). Sized for two 10s Pay.gov attempts plus overhead, under API Gateway's 29s cap."
  type        = number
  default     = 27
}

variable "payment_lambda_provisioned_concurrency" {
  description = "Provisioned concurrency units for each payment-flow Lambda alias (initPayment, processPayment, getDetails). Set to 0 to disable."
  type        = number
  default     = 0

  validation {
     condition     = var.payment_lambda_provisioned_concurrency >= 0 && floor(var.payment_lambda_provisioned_concurrency) == var.payment_lambda_provisioned_concurrency
     error_message = "payment_lambda_provisioned_concurrency must be a non-negative integer."
   }
}


variable "subnet_ids" {
  description = "List of subnet IDs for Lambda VPC configuration"
  type        = list(string)
}

variable "security_group_ids" {
  description = "List of security group IDs for Lambda VPC configuration"
  type        = list(string)
}

variable "environment_variables_by_function" {
  description = "Per-function environment variable maps, keyed by function name"
  type        = map(map(string))
  default     = {}
}

variable "tags" {
  description = "Tags to apply to Lambda functions"
  type        = map(string)
  default     = {}
}

variable "log_retention_days" {
  description = "CloudWatch log retention period in days"
  type        = number
  default     = 14
}

variable "artifact_bucket" {
  description = "S3 bucket containing Lambda artifacts"
  type        = string
}

variable "artifact_s3_keys" {
  description = "Map of function names to S3 keys for artifacts"
  type        = map(string)
}

variable "source_code_hashes" {
  description = "Map of function names to base64-encoded SHA256 hashes"
  type        = map(string)
}
