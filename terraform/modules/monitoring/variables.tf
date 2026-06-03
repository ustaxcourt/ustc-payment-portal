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
  description = "Map of function key to log group name. Used by the 5xx log metric filters."
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

# Teams routing. All three must be set together or Teams resources are skipped.
# AWS Chatbot app must be consented in the M365 tenant before messages route.
variable "teams_tenant_id" {
  description = "Microsoft 365 tenant ID."
  type        = string
  default     = null
}

variable "teams_team_id" {
  description = "Microsoft Teams team ID."
  type        = string
  default     = null
}

variable "teams_channel_id" {
  description = "Microsoft Teams channel ID where alerts are posted."
  type        = string
  default     = null
}
