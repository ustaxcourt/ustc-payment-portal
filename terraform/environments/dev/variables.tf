variable "namespace" {
  description = "Environment namespace (dev, pr-123, etc.)"
  type        = string
  default     = "dev"
}

variable "artifact_bucket" {
  description = "S3 bucket with Lambda artifacts"
  type        = string
  default     = ""
}

variable "initPayment_s3_key" {
  description = "S3 key for initPayment Lambda artifact"
  type        = string
  default     = ""
}

variable "processPayment_s3_key" {
  description = "S3 key for processPayment Lambda artifact"
  type        = string
  default     = ""
}

variable "getDetails_s3_key" {
  description = "S3 key for getDetails Lambda artifact"
  type        = string
  default     = ""
}

variable "testCert_s3_key" {
  description = "S3 key for testCert Lambda artifact"
  type        = string
  default     = ""
}

variable "initPayment_source_code_hash" {
  description = "Base64-encoded SHA256 hash for initPayment artifact"
  type        = string
  default     = ""
}

variable "processPayment_source_code_hash" {
  description = "Base64-encoded SHA256 hash for processPayment artifact"
  type        = string
  default     = ""
}

variable "getDetails_source_code_hash" {
  description = "Base64-encoded SHA256 hash for getDetails artifact"
  type        = string
  default     = ""
}

variable "testCert_source_code_hash" {
  description = "Base64-encoded SHA256 hash for testCert artifact"
  type        = string
  default     = ""
}
