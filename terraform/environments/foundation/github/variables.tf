variable "enforcement" {
  description = "Ruleset enforcement. Use 'evaluate' to dry-run (log violations, don't block) before switching to 'active'; 'disabled' to roll back."
  type        = string
  default     = "active"

  validation {
    condition     = contains(["active", "evaluate", "disabled"], var.enforcement)
    error_message = "enforcement must be one of: active, evaluate, disabled."
  }
}
