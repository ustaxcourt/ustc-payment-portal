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

resource "aws_route53_record" "dashboard_stg_delegation" {
  zone_id = aws_route53_zone.this.zone_id
  name    = "stg-dashboard.${local.custom_domain}"
  type    = "NS"
  ttl     = 172800

  records = [
    "ns-1181.awsdns-19.org",
    "ns-1748.awsdns-26.co.uk",
    "ns-349.awsdns-43.com",
    "ns-773.awsdns-32.net",
  ]

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_route53_record" "dashboard_prod_delegation" {
  zone_id = aws_route53_zone.this.zone_id
  name    = "dashboard.${local.custom_domain}"
  type    = "NS"
  ttl     = 172800

  records = [
    "ns-1238.awsdns-26.org",
    "ns-1547.awsdns-01.co.uk",
    "ns-46.awsdns-05.com",
    "ns-818.awsdns-38.net",
  ]

  lifecycle {
    prevent_destroy = true
  }
}
