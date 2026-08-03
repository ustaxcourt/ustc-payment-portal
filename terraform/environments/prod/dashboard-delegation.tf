resource "aws_route53_record" "dashboard_delegation" {
  for_each = var.dashboard_delegations

  zone_id = aws_route53_zone.this.zone_id
  name    = "${each.key}.${local.custom_domain}"
  type    = "NS"
  ttl     = 172800

  records = each.value

  lifecycle {
    prevent_destroy = true
  }
}

moved {
  from = aws_route53_record.dashboard_dev_delegation
  to   = aws_route53_record.dashboard_delegation["dev-dashboard"]
}

moved {
  from = aws_route53_record.dashboard_stg_delegation
  to   = aws_route53_record.dashboard_delegation["stg-dashboard"]
}

moved {
  from = aws_route53_record.dashboard_prod_delegation
  to   = aws_route53_record.dashboard_delegation["dashboard"]
}
