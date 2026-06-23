variable "name" {
  description = "Unique name for the RDS Proxy (e.g. payment-portal-prod-proxy)"
  type        = string

  validation {
    condition     = length(var.name) >= 1 && length(var.name) <= 59
    error_message = "name must be 1-59 characters (leaves room for the -role IAM suffix and the 60-char proxy name limit)."
  }
}

variable "db_port" {
  description = "Port the backend database listens on. Combined with the proxy host so the endpoint output matches the rds module's host:port contract."
  type        = number
  default     = 5432
}

variable "secret_arn" {
  description = "Secrets Manager ARN holding the DB credentials the proxy authenticates with ({username,password}). Reuse the same secret the Lambdas use - prod's AWS-managed rds! secret, dev's custom secret."
  type        = string
}

variable "rds_instance_identifier" {
  description = "Identifier of the RDS instance to register as the proxy's target (e.g. payment-portal-dev)"
  type        = string
}

variable "vpc_subnet_ids" {
  description = "Private subnet IDs to place the proxy in (must reach the RDS instance; same subnets as the DB)"
  type        = list(string)
}

variable "vpc_security_group_ids" {
  description = "Security group IDs to attach to the proxy. Created in the networking module; allows Lambda ingress and RDS egress on 5432."
  type        = list(string)
}

variable "max_connections_percent" {
  description = "Ceiling on backend DB connections the proxy may open, as a percent of the instance's max_connections. PO-agreed: ~75 in prod (~150 of ~200), ~50 in dev to leave slots for direct-connecting PR workspaces. This is a safety ceiling, NOT the expected steady-state (~20)."
  type        = number
  default     = 75

  validation {
    condition     = var.max_connections_percent > 0 && var.max_connections_percent <= 100
    error_message = "max_connections_percent must be between 1 and 100."
  }
}

variable "max_idle_connections_percent" {
  description = "Percent of max_connections the proxy keeps idle/warm for reuse. Must be <= max_connections_percent. Null uses the AWS default (50)."
  type        = number
  default     = null

  validation {
    condition     = var.max_idle_connections_percent == null || var.max_idle_connections_percent <= var.max_connections_percent
    error_message = "max_idle_connections_percent must be null or <= max_connections_percent."
  }
}

variable "connection_borrow_timeout" {
  description = "Seconds a client waits for a connection from the pool before erroring (AWS default 120)."
  type        = number
  default     = 120
}

variable "require_tls" {
  description = "Require TLS between the client (Lambda) and the proxy. The app already connects with the RDS CA bundle, so keep this true."
  type        = bool
  default     = true
}

variable "idle_client_timeout" {
  description = "Seconds before the proxy closes an idle client connection (AWS default 1800)."
  type        = number
  default     = 1800
}

variable "debug_logging" {
  description = "Enable per-statement debug logging on the proxy. Leave false outside of active troubleshooting - it can log query text."
  type        = bool
  default     = false
}

variable "secret_kms_key_arn" {
  description = "KMS key ARN that encrypts secret_arn, if a customer-managed key is used. Null relies on the AWS-managed secretsmanager key (scoped via the kms:ViaService condition)."
  type        = string
  default     = null
}

variable "tags" {
  description = "Tags to apply to the proxy and its IAM role"
  type        = map(string)
  default     = {}
}
