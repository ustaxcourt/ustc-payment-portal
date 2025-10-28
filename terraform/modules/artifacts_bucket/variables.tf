variable "build_artifacts_bucket_name" {
  description = "Name for build artifacts bucket"
  type = string
}


variable "deployer_role_arn" {
  type        = string
  description = "Deployer role ARN (GitHub Actions deployer role in dev)"
}

variable "manage_bucket_policy" {
  description = "Whether this module should create/update the S3 bucket policy"
  type        = bool
  default     = false
}
