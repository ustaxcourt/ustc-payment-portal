variable "env" {
  description = "Environment name (stg, prod, dev)"
  type        = string
}

variable "name_prefix" {
  description = "Resource name prefix matching the codebase convention (e.g., ustc-payment-portal-stg)"
  type        = string
}

variable "service_name" {
  description = "Service name applied to tags. Used by future dashboards and cross-service filtering."
  type        = string
  default     = "payment-portal"
}

variable "owner" {
  description = "Team or individual accountable for these alerts. Used in tags."
  type        = string
  default     = "payments-team"
}

variable "subscribers" {
  description = "Subscribers to the alerts SNS topic. Wired in Phase 2; empty until then."
  type = list(object({
    protocol = string
    endpoint = string
  }))
  default = []
}

variable "lambda_functions" {
  description = "Map of Lambda function key (e.g., \"processPayment\") to deployed function name (e.g., \"ustc-payment-portal-stg-processPayment\"). The key drives alarm naming; the value drives the CloudWatch dimension."
  type        = map(string)
  default     = {}
}

variable "lambda_log_group_names" {
  description = "Map of Lambda function key to CloudWatch log group name. Wired in Phase 3 for log-based metric filters; empty until then."
  type        = map(string)
  default     = {}
}

variable "runbook_url" {
  description = "URL to the runbook included in alarm descriptions so the SNS message body links to it."
  type        = string
  default     = ""
}

variable "tags" {
  description = "Additional tags applied to all resources alongside the module defaults."
  type        = map(string)
  default     = {}
}
