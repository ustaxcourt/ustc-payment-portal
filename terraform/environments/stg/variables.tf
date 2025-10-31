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

variable "testCert_s3_key {
   type = string
}


variable "initPayment_source_code_hash" {
  type = string,
  default = ""
}

variable "processPayment_source_code_hash" {
  type = string,
  default = ""
}

variable "getDetails_source_code_hash" {
   type = string, default = ""
}

variable "testCert_source_code_hash" {
  type = string,
   default = ""
}
