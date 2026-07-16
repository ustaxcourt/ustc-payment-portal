variable "artifact_bucket" {
  type = string
}

variable "initPayment_s3_key" {
  type = string
}

variable "processPayment_s3_key" {
  type = string
}

variable "getDetails_s3_key" {
  type = string
}

variable "testCert_s3_key" {
  type = string
}


variable "initPayment_source_code_hash" {
  type    = string
  default = ""
}

variable "processPayment_source_code_hash" {
  type    = string
  default = ""
}

variable "getDetails_source_code_hash" {
  type    = string
  default = ""
}

variable "testCert_source_code_hash" {
  type    = string
  default = ""
}

variable "migrationRunner_s3_key" {
  type = string
}

variable "migrationRunner_source_code_hash" {
  type    = string
  default = ""
}

# Teams routing IDs sourced from PROD_TEAMS_* GitHub secrets via TF_VAR_*; null disables routing.
variable "teams_tenant_id" {
  type    = string
  default = null
}

variable "teams_team_id" {
  type    = string
  default = null
}

variable "teams_channel_id" {
  type    = string
  default = null
}

