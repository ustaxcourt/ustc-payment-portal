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

variable "health_window_seconds" {
  description = "Evaluation window (seconds) for both child alarms. Must exceed the ~15-min probe cadence so each window contains at least one probe. Default 1200 (20 min) per the PAY-215 acceptance criteria."
  type        = number
  default     = 1200

  validation {
    condition     = var.health_window_seconds > 900 && var.health_window_seconds % 60 == 0
    error_message = "health_window_seconds must be greater than 900 (wider than the 15-min probe cadence) and a multiple of 60 (valid CloudWatch alarm period)."
  }
}

variable "error_alarm_threshold" {
  description = "Number of Pay.gov transport errors (Sum of PayGovError) within the window that trips the error child alarm. Default 1 = page on a single error."
  type        = number
  default     = 1

  validation {
    condition = (
      var.error_alarm_threshold >= 1 &&
      floor(var.error_alarm_threshold) == var.error_alarm_threshold
    )
    error_message = "error_alarm_threshold must be a positive integer (>= 1)."
  }
}

variable "tags" {
  description = "Tags to apply to created resources"
  type        = map(string)
  default     = {}
}
