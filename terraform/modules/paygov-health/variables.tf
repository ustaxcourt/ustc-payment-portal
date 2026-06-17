variable "name_prefix" {
  description = "Resource name prefix (must match the deployer policy scope, e.g. ustc-payment-processor)"
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev/stg/prod). Must match the testCert Lambda's APP_ENV — it is the value of the CloudWatch metric's Environment dimension."
  type        = string
}

variable "testcert_function_name" {
  description = "Name of the testCert Lambda invoked by the schedule"
  type        = string
}

variable "testcert_function_arn" {
  description = "ARN of the testCert Lambda invoked by the schedule"
  type        = string
}

variable "alarm_sns_topic_arns" {
  description = "SNS topic ARNs to notify on alarm/ok transitions. Empty = alarm with no notification target (still visible on dashboards and the console)."
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Tags to apply to created resources"
  type        = map(string)
  default     = {}
}
