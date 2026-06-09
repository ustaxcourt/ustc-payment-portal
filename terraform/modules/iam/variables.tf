variable "name_prefix" {
  description = "Prefix to use for IAM role names"
  type        = string
  default     = ""
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

variable "aws_region" {
  type    = string
  default = "us-east-1"
}
variable "project_name" {
  description = "Project name used for tagging and names"
  type        = string
  default     = "ustc-payment-portal"
}

variable "lambda_name_prefix" {
  type        = string
  description = "Lambda name prefix to scope permissions"
  default     = ""
}

variable "environment" {
  description = "Environment (e.g., dev, staging, prod)"
  type        = string
  default     = ""
}

variable "deploy_role_name" {
  type        = string
  description = "IAM role name for CI/CD"
  default     = ""
}

variable "read_only_role_name" {
  type        = string
  description = "IAM role name for the read-only CI role (used by the terraform-plan workflow today; general-purpose)."
  default     = ""
}

variable "github_oidc_provider_arn" {
  type        = string
  description = "GitHub OIDC provider ARN in the account"
  default     = ""
}

variable "github_org" {
  type        = string
  description = "GitHub org"
  default     = ""
}

variable "github_repo" {
  type        = string
  description = "GitHub repo"
  default     = ""
}

variable "state_bucket_name" {
  type        = string
  description = "Terraform backend S3 bucket"
  default     = ""
}
