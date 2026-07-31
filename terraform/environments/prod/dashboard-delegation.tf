# Delegates dashboard subdomains out of payments.ustaxcourt.gov to the account
# hosting each dashboard. NS values come from that environment's
# `dashboard_zone_name_servers` output in ustc-payment-portal-dashboard, and go
# stale if the zone there is ever destroyed and recreated.

resource "aws_route53_record" "dashboard_dev_delegation" {
  zone_id = aws_route53_zone.this.zone_id
  name    = "dev-dashboard.${local.custom_domain}"
  type    = "NS"
  ttl     = 172800

  records = [
    "ns-1006.awsdns-61.net",
    "ns-1378.awsdns-44.org",
    "ns-1641.awsdns-13.co.uk",
    "ns-320.awsdns-40.com",
  ]

  lifecycle {
    prevent_destroy = true
  }
}

locals {
  # Paste each environment's `dashboard_zone_name_servers` output here once that
  # zone exists. A subdomain delegated to nameservers that do not host the zone
  # resolves to SERVFAIL, so an empty list creates no record at all rather than
  # a broken one. Filling the list is the whole change; nothing else to edit.
  dashboard_stg_name_servers  = []
  dashboard_prod_name_servers = []
}

resource "aws_route53_record" "dashboard_stg_delegation" {
  count = length(local.dashboard_stg_name_servers) > 0 ? 1 : 0

  zone_id = aws_route53_zone.this.zone_id
  name    = "stg-dashboard.${local.custom_domain}"
  type    = "NS"
  ttl     = 172800

  records = local.dashboard_stg_name_servers

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_route53_record" "dashboard_prod_delegation" {
  count = length(local.dashboard_prod_name_servers) > 0 ? 1 : 0

  zone_id = aws_route53_zone.this.zone_id
  name    = "dashboard.${local.custom_domain}"
  type    = "NS"
  ttl     = 172800

  records = local.dashboard_prod_name_servers

  lifecycle {
    prevent_destroy = true
  }
}
