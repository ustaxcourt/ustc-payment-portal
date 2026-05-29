variable "env" {
  description = "Environment name (stg, prod, dev)"
  type        = string
}

variable "name_prefix" {
  description = "Resource name prefix matching the codebase convention (e.g., ustc-payment-portal-stg)"
  type        = string
}

variable "service_name" {
  description = "Service name applied to tags."
  type        = string
  default     = "payment-portal"
}

variable "owner" {
  description = "Team or individual accountable for these alerts."
  type        = string
  default     = "payments-team"
}

variable "subscribers" {
  description = "SNS topic subscribers."
  type = list(object({
    protocol = string
    endpoint = string
  }))
  default = []
}

variable "lambda_functions" {
  description = "Map of function key to deployed function name. Key drives alarm naming, value drives the CloudWatch dimension."
  type        = map(string)
  default     = {}
}

variable "lambda_log_group_names" {
  description = "Map of function key to log group name. Used by Phase 3 log filters."
  type        = map(string)
  default     = {}
}

variable "runbook_url" {
  description = "Runbook URL included in alarm descriptions."
  type        = string
  default     = ""
}

variable "tags" {
  description = "Additional tags applied to all resources."
  type        = map(string)
  default     = {}
}
