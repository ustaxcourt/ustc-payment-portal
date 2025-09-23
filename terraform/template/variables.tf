variable "aws_region" {
    description = "AWS region for resources"
    type        = string 
    default     = "us-east-1"
}

variable "environment" {
    description = "Environment name"
    type        = string
    
}

variable "project_name" {
    description = "Name of the project"
    type        = string
}

variable "custom_domain" {
  description = "Custom domain name for the API"
  type        = string
  default     = "fill out"
}

variable "base_url" {
  description = "Base URL for the application"
  type        = string
}

variable "node_env" {
  description = "Node.js environment"
  type        = string
}

# Lambda Configuration
variable "lambda_runtime" {
  description = "Runtime for Lambda functions"
  type        = string
  default     = "nodejs22.x"
}


variable "lambda_timeout" {
  description = "Timeout for Lambda functions in seconds"
  type        = number
  default     = 30
}

variable "lambda_memory_size" {
  description = "Memory size for Lambda functions in MB"
  type        = number
  default     = 512
}

# S3 Configuration
variable "s3_force_destroy" {
  description = "Force destroy S3 bucket even if it contains objects"
  type        = bool
  default     = false
}

# API Gateway Configuration
variable "api_gateway_stage_name" {
  description = "Stage name for API Gateway deployment"
  type        = string
}

# Domain and SSL Configuration
variable "certificate_arn" {
  description = "ARN of the SSL certificate for custom domain (leave empty to skip domain setup)"
  type        = string
}

variable "route53_zone_id" {
  description = "Route53 hosted zone ID for the domain"
  type        = string
}

variable "github_org" {
  description = "GitHub organization name"
  type        = string
  default     = "ustaxcourt"
}


variable "github_repo" {
  description = "GitHub repository name"
  type        = string
  default     = "ustc-payment-portal-${var.environment}"
}

variable "github_ref" {
  description = "Git reference that can assume the role (e.g., refs/heads/main)"
  type        = string
}


variable "deploy_role_name" {
  description = "Name of Iam role assumed by Github actions"
  type        = string
  default     = "ustc-github-actions-oidc-deployer-role"
}

variable "github_oidc_provider_arn" {
  type        = string
  description = "ARN of IdP created for Github in AWS IAM"
}

variable "tf_state_bucket_name" {
  description = "Name of the S3 bucket that stores Terraform state for this environment"
  type        = string
}

variable "tf_lock_table_name" {
  description = "Name of the DynamoDB table used for Terraform state locking for this environment"
  type        = string
}


