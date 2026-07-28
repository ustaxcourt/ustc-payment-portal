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
}
