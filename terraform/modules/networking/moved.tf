# moved.tf — Terraform state address migrations
#
# These blocks map the OLD singular resource addresses (from before the multi-AZ
# refactor) to the new for_each-keyed addresses. Without them, Terraform would
# plan to destroy and recreate the existing subnets, NAT gateway, route tables,
# and the Pay.gov-allowlisted EIP in prod.
#
# The EIP-specific moves (nat_replacement -> nat["..."]) diverge per environment
# and therefore live in each foundation root (dev-networking/main.tf, etc.)
# rather than here.

moved {
  from = aws_subnet.public_subnet
  to   = aws_subnet.public["us-east-1a"]
}

moved {
  from = aws_subnet.private_subnet
  to   = aws_subnet.private["us-east-1a"]
}

moved {
  from = aws_subnet.private_subnet_2[0]
  to   = aws_subnet.private["us-east-1b"]
}

moved {
  from = aws_nat_gateway.default_nat_gw
  to   = aws_nat_gateway.this["us-east-1a"]
}

moved {
  from = aws_route_table.private_rt
  to   = aws_route_table.private["us-east-1a"]
}

moved {
  from = aws_route.private_default_route
  to   = aws_route.private_default["us-east-1a"]
}

moved {
  from = aws_route_table_association.private_rta
  to   = aws_route_table_association.private["us-east-1a"]
}

moved {
  from = aws_route_table_association.private_rta_2[0]
  to   = aws_route_table_association.private["us-east-1b"]
}

moved {
  from = aws_route_table_association.public_rta
  to   = aws_route_table_association.public["us-east-1a"]
}

moved {
  from = aws_db_subnet_group.rds[0]
  to   = aws_db_subnet_group.rds
}

moved {
  from = aws_security_group.rds[0]
  to   = aws_security_group.rds
}
