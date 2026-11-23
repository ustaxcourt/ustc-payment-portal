variable "name_prefix" {
  description = "Resource name prefix (must match the deployer policy scope, e.g. ustc-payment-processor)"
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev/stg/prod). Must match the cancelExpired Lambda's APP_ENV — it is the value of the CloudWatch metric's Environment dimension."
  type        = string
}

variable "cancel_expired_function_name" {
  description = "Name of the cancelExpired Lambda invoked by the schedule"
  type        = string
}

variable "cancel_expired_function_arn" {
  description = "ARN of the cancelExpired Lambda invoked by the schedule"
  type        = string
}

variable "schedule_enabled" {
  description = "Whether the EventBridge rule fires. Ships false so the Lambda can deploy dark and be invoked manually first; flip to true per environment once a manual run looks right. Disabling it is also the rollback."
  type        = bool
  default     = false
}

variable "schedule_expression" {
  description = "Cadence for expired-session cancellation and unknown-payment-outcome detection. At the default, cancellation may lag token expiration by 15 minutes; processing attempts with no tracking ID may be detected up to 15 minutes after the 10-minute stale threshold."
  type        = string
  default     = "rate(15 minutes)"
}

variable "spike_alarm_threshold" {
  description = "TransactionsCancelled in one evaluation window that trips the spike alarm. A jump means something upstream broke — a bad redirect URL, a Pay.gov outage — not that more payers wandered off."
  type        = number
  default     = 25
}

variable "spike_window_seconds" {
  description = "Evaluation window (seconds) for the spike alarm. Must exceed the sweep cadence so each window contains at least one run."
  type        = number
  default     = 1800
}

variable "alarm_sns_topic_arns" {
  description = "SNS topic ARNs to notify on alarm/ok transitions. Empty = alarm with no notification target (still visible on dashboards and the console)."
  type        = list(string)
  default     = []
}

variable "runbook_url" {
  description = "URL of the runbook for responding to a cancellation-spike alarm. Surfaced in the alarm description / notification."
  type        = string
  default     = ""
}

variable "tags" {
  description = "Tags applied to every resource in this module"
  type        = map(string)
  default     = {}
}
