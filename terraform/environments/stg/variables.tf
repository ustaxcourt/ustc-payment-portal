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

variable "validateClient_s3_key" {
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

variable "validateClient_source_code_hash" {
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

# Teams routing IDs sourced from STAGING_TEAMS_* GitHub secrets via TF_VAR_*; null disables routing.
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

variable "cancelExpired_s3_key" {
  description = "S3 key for cancelExpired Lambda artifact"
  type        = string
  default     = ""
}

variable "cancelExpired_source_code_hash" {
  description = "Base64-encoded SHA256 hash for cancelExpired artifact"
  type        = string
  default     = ""
}

variable "getAllTransactions_s3_key" {
  description = "S3 key for getAllTransactions Lambda artifact"
  type        = string
  default     = ""
}

variable "getTransactionsByStatus_s3_key" {
  description = "S3 key for getTransactionsByStatus Lambda artifact"
  type        = string
  default     = ""
}

variable "getTransactionPaymentStatus_s3_key" {
  description = "S3 key for getTransactionPaymentStatus Lambda artifact"
  type        = string
  default     = ""
}

variable "getTransactionLog_s3_key" {
  description = "S3 key for getTransactionLog Lambda artifact"
  type        = string
  default     = ""
}

variable "getRevenueSummary_s3_key" {
  description = "S3 key for getRevenueSummary Lambda artifact"
  type        = string
  default     = ""
}

variable "getAllTransactions_source_code_hash" {
  description = "Base64-encoded SHA256 hash for getAllTransactions artifact"
  type        = string
  default     = ""
}

variable "getTransactionsByStatus_source_code_hash" {
  description = "Base64-encoded SHA256 hash for getTransactionsByStatus artifact"
  type        = string
  default     = ""
}

variable "getTransactionPaymentStatus_source_code_hash" {
  description = "Base64-encoded SHA256 hash for getTransactionPaymentStatus artifact"
  type        = string
  default     = ""
}

variable "getTransactionLog_source_code_hash" {
  description = "Base64-encoded SHA256 hash for getTransactionLog artifact"
  type        = string
  default     = ""
}

variable "getRevenueSummary_source_code_hash" {
  description = "Base64-encoded SHA256 hash for getRevenueSummary artifact"
  type        = string
  default     = ""
}
