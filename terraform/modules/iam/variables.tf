variable "name_prefix" {
  description = "Prefix to use for IAM role names"
  type        = string
}

variable "tags" {
  description = "Common tags to apply to IAM resources"
  type        = map(string)
  default     = {}
}

variable "assume_role_services" {
  description = "List of AWS services allowed to assume the role"
  type        = list(string)
  default     = ["lambda.amazonaws.com"]
}

variable "attach_basic_execution" {
  description = "Attach AWSLambdaBasicExecutionRole managed policy"
  type        = bool
  default     = true
}

variable "attach_vpc_access" {
  description = "Attach AWSLambdaVPCAccessExecutionRole managed policy"
  type        = bool
  default     = true
}
