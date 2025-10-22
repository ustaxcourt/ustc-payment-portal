variable "build_artifacts_bucket_name" {
  description = "Name for build artifacts bucket"
  type = string
}


variable "deployer_role_arn" {
  type = string
  description = "Deployer role arn"
}
