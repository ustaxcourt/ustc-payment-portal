variable "environment" {
  type        = string
  description = "Deployment environment (dev, stg, prod)."
}

variable "name_prefix" {
  type        = string
  description = "Resource name prefix."
}

variable "aws_region" {
  type        = string
  description = "AWS region for foundation resources."
}

variable "github_org" {
  type        = string
  description = "GitHub organization allowed to assume deploy roles via OIDC."
}

variable "github_repo" {
  type        = string
  description = "GitHub repository allowed to assume deploy roles via OIDC."
}

variable "state_bucket_name" {
  type        = string
  description = "S3 backend bucket name for this environment."
}

variable "vpc_cidr" {
  type        = string
  description = "VPC CIDR block."
}

variable "public_subnet_cidr" {
  type        = string
  description = "Public subnet CIDR block."
}

variable "private_subnet_cidr" {
  type        = string
  description = "Primary private subnet CIDR block."
}

variable "private_subnet_cidr_2" {
  type        = string
  description = "Secondary private subnet CIDR block."
}

variable "availability_zone" {
  type        = string
  description = "Primary availability zone."
}

variable "availability_zone_2" {
  type        = string
  description = "Secondary availability zone."
}

variable "lambda_name_prefix" {
  type        = string
  description = "Lambda name prefix expected by IAM policy wiring."
}

variable "tags" {
  type        = map(string)
  description = "Common tags applied to all foundation resources."
}

variable "create_artifacts_bucket" {
  type        = bool
  description = "Whether this environment should manage the shared build artifacts bucket and attachment."
  default     = false
}

variable "build_artifacts_bucket_name" {
  type        = string
  description = "Name of the shared build artifacts bucket."
  default     = ""
}

variable "staging_deployer_role_arn" {
  type        = string
  description = "Staging deployer role ARN granted artifact bucket access."
  default     = ""
}

variable "prod_deployer_role_arn" {
  type        = string
  description = "Prod deployer role ARN granted artifact bucket access."
  default     = ""
}
