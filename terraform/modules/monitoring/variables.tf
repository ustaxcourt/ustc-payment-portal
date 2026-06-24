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

variable "paygov_retry_alarm_threshold" {
  description = "Number of Pay.gov retry warnings in a single 5-min bucket that constitutes sustained flakiness. A few retries are normal (the retry succeeds), so this is intentionally higher than 1 and severity is warning, not critical. Tune once real traffic exists."
  type        = number
  default     = 5
}

variable "throttle_runbook_url" {
  description = "Runbook URL for API Gateway 429 throttle alarms. Falls back to runbook_url if not set."
  type        = string
  default     = ""
}

variable "throttle_429_threshold" {
  description = "Number of 429s in a 5-minute period required to trigger the api-gateway-429 alarm. Default 1 (any throttle fires). Raise for prod to reduce noise from expected bursts."
  type        = number
  default     = 1
}

variable "tags" {
  description = "Additional tags applied to all resources."
  type        = map(string)
  default     = {}
}

# Teams routing. All three must be set together or Teams resources are skipped.
# AWS Chatbot app must be consented in the M365 tenant before messages route.
# sensitive = true keeps the values out of terraform plan/apply output.
variable "teams_tenant_id" {
  description = "Microsoft 365 tenant ID."
  type        = string
  default     = null
  sensitive   = true
}

variable "teams_team_id" {
  description = "Microsoft Teams team ID."
  type        = string
  default     = null
  sensitive   = true
}

variable "teams_channel_id" {
  description = "Microsoft Teams channel ID where alerts are posted."
  type        = string
  default     = null
  sensitive   = true
}

variable "api_gateway_access_log_group_name" {
  description = "Name of the API Gateway access log group. When set, creates a 429 throttle metric filter and alarm."
  type        = string
  default     = null
}

variable "proxy_name" {
  description = "RDS Proxy name. When set, creates connection/pinning/availability alarms for the proxy. Null disables them."
  type        = string
  default     = null
}

variable "proxy_connections_threshold" {
  description = "Alarm when backend DB connections through the proxy stay at/above this. Starter value — tune from the Phase 6 load-test baseline (expected steady-state ~20; below each env's cap of ~150 prod / ~100 dev)."
  type        = number
  default     = 100
}

variable "proxy_pinned_threshold" {
  description = "Alarm when session-pinned connections stay at/above this. Should be ~0 — pinning defeats connection multiplexing."
  type        = number
  default     = 5
}

variable "proxy_availability_threshold" {
  description = "Alarm when proxy availability percentage (READ_WRITE target group) drops below this."
  type        = number
  default     = 99
}
