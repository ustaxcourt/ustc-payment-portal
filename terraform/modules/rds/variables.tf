variable "identifier" {
  description = "Unique name for the RDS instance (e.g. payment-portal-dev)"
  type        = string
}

variable "db_name" {
  description = "Name of the default database to create on the instance"
  type        = string
}

variable "username" {
  description = "Master username for the database"
  type        = string
}

variable "password" {
  description = "Master password; pass from a secret (e.g. Secrets Manager), not a literal. Ignored when manage_master_user_password is true."
  type        = string
  sensitive   = true
  default     = null
}

variable "manage_master_user_password" {
  description = "Let AWS manage the master password via Secrets Manager (recommended for prod). When true, password variable is ignored."
  type        = bool
  default     = false
}

variable "instance_class" {
  description = "RDS instance class (e.g. db.t3.small per ADR)"
  type        = string
  default     = "db.t3.small"
}

variable "allocated_storage" {
  description = "Allocated storage in GB (e.g. 20 per ADR)"
  type        = number
  default     = 20
}

variable "max_allocated_storage" {
  description = "Upper limit in GB for RDS storage autoscaling (0 = disabled)"
  type        = number
  default     = 0
}

variable "backup_retention_period" {
  description = "Days to retain automated backups (e.g. 7)"
  type        = number
  default     = 7
}

variable "multi_az" {
  description = "Deploy a standby in another AZ for failover (true for prod per ADR)"
  type        = bool
  default     = false
}

variable "vpc_security_group_ids" {
  description = "List of security group IDs to attach to the RDS instance"
  type        = list(string)
}

variable "db_subnet_group_name" {
  description = "Name of the DB subnet group (subnets must be in at least 2 AZs for Multi-AZ)"
  type        = string
}

variable "deletion_protection" {
  description = "If true, instance cannot be deleted without disabling this first (use false for non-prod)"
  type        = bool
  default     = false
}

variable "skip_final_snapshot" {
  description = "Skip final snapshot on deletion (true for non-prod, false for prod)"
  type        = bool
  default     = true
}

variable "final_snapshot_identifier" {
  description = "Snapshot identifier for final snapshot when skip_final_snapshot is false (required for prod deletion)"
  type        = string
  default     = null
}

variable "log_statement" {
  description = "PostgreSQL log_statement level (none, ddl, mod, all). Use 'ddl' for prod to avoid logging PII."
  type        = string
  default     = "all"

  validation {
    condition     = contains(["none", "ddl", "mod", "all"], var.log_statement)
    error_message = "Must be one of: none, ddl, mod, all."
  }
}

variable "tags" {
  description = "Tags to apply to RDS resources"
  type        = map(string)
  default     = {}
}
