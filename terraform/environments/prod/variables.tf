variable "artifact_bucket" {
  type = string
}

variable "initPayment_s3_key" {
  type = string
}

variable "processPayment_s3_key" {
  type = string
}

variable "getDetails_s3_key" {
  type = string
}

variable "testCert_s3_key" {
  type = string
}


variable "initPayment_source_code_hash" {
  type    = string
  default = ""
}

variable "processPayment_source_code_hash" {
  type    = string
  default = ""
}

variable "getDetails_source_code_hash" {
  type    = string
  default = ""
}

variable "testCert_source_code_hash" {
  type    = string
  default = ""
}

variable "migrationRunner_s3_key" {
  type = string
}

variable "migrationRunner_source_code_hash" {
  type    = string
  default = ""
}

variable "dashboard_delegations" {
  description = <<-EOT
    NS delegation targets for the dashboard subdomains of payments.ustaxcourt.gov,
    keyed by subdomain label. Each value is the `dashboard_zone_name_servers`
    output of the matching environment in ustc-payment-portal-dashboard; those
    zones live in other accounts, so the values are carried here rather than read
    from remote state. Override with TF_VAR_dashboard_delegations if a dashboard
    hosted zone is ever recreated and its name servers change.
  EOT
  type        = map(list(string))

  default = {
    "dev-dashboard" = [
      "ns-1006.awsdns-61.net",
      "ns-1378.awsdns-44.org",
      "ns-1641.awsdns-13.co.uk",
      "ns-320.awsdns-40.com",
    ]
    "stg-dashboard" = [
      "ns-1181.awsdns-19.org",
      "ns-1748.awsdns-26.co.uk",
      "ns-349.awsdns-43.com",
      "ns-773.awsdns-32.net",
    ]
    "dashboard" = [
      "ns-1238.awsdns-26.org",
      "ns-1547.awsdns-01.co.uk",
      "ns-46.awsdns-05.com",
      "ns-818.awsdns-38.net",
    ]
  }

  validation {
    condition     = alltrue([for ns in values(var.dashboard_delegations) : length(ns) >= 2])
    error_message = "Each delegation needs at least two name servers."
  }

  validation {
    condition     = alltrue([for ns in values(var.dashboard_delegations) : alltrue([for host in ns : can(regex("^[a-z0-9.-]+\\.[a-z]{2,}$", host))])])
    error_message = "Name servers must be bare hostnames, e.g. ns-320.awsdns-40.com."
  }
}

# Teams routing IDs sourced from PROD_TEAMS_* GitHub secrets via TF_VAR_*; null disables routing.
variable "teams_tenant_id" {
  type    = string
  default = null
}

variable "teams_team_id" {
  type    = string
  default = null
}

variable "teams_channel_id" {
  type    = string
  default = null
}

