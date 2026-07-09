mock_provider "aws" {}

# HA egress (single_nat_gateway = false): per-AZ subnet/EIP/NAT/route table. Prod/stg topology.
run "ha_two_az_creates_redundant_egress" {
  command = plan

  variables {
    vpc_cidr             = "10.0.0.0/16"
    availability_zones   = ["us-east-1a", "us-east-1b"]
    single_nat_gateway   = false
    public_subnet_cidrs  = ["10.0.1.0/24", "10.0.11.0/24"]
    private_subnet_cidrs = ["10.0.2.0/24", "10.0.12.0/24"]
    enable_proxy         = true
    name_prefix          = "ustc-dev"
    tags                 = { Environment = "dev" }
  }

  assert {
    condition     = length(aws_nat_gateway.this) == 2
    error_message = "HA mode should provision one NAT gateway per AZ"
  }

  assert {
    condition     = length(aws_route_table.private) == 2
    error_message = "HA mode should provision one private route table per egress AZ"
  }

  assert {
    condition     = length(aws_subnet.public) == 2 && length(aws_subnet.private) == 2
    error_message = "HA mode should create a public and private subnet in each AZ"
  }

  assert {
    condition     = length(aws_eip.nat) == 2
    error_message = "with no pinned allocation IDs, one EIP should be created per egress AZ"
  }

  # RDS subnet group is unconditional (always spans all private subnets).
  assert {
    condition     = output.db_subnet_group_name == "ustc-dev-db-subnet-group"
    error_message = "db subnet group should always be created and named from name_prefix"
  }

  assert {
    condition     = length(aws_security_group.proxy) == 1
    error_message = "proxy security group should be created when enable_proxy is true"
  }

  assert {
    condition     = length(output.proxy_subnet_ids) == 2
    error_message = "proxy_subnet_ids should include every private subnet"
  }

  assert {
    condition     = length(output.private_subnet_ids) == 2
    error_message = "private_subnet_ids should include every private subnet"
  }
}

# Pay.gov pins us-east-1a's allowlisted EIP: a pinned AZ must reuse its allocation,
# never allocate a fresh EIP (which would change the egress IP and break Pay.gov).
run "nat_eip_pinning_reuses_one_az_allocates_other" {
  command = plan

  variables {
    vpc_cidr             = "10.0.0.0/16"
    availability_zones   = ["us-east-1a", "us-east-1b"]
    single_nat_gateway   = false
    public_subnet_cidrs  = ["10.0.1.0/24", "10.0.11.0/24"]
    private_subnet_cidrs = ["10.0.2.0/24", "10.0.12.0/24"]
    nat_eip_allocation_ids = {
      "us-east-1a" = "eipalloc-0aaaaaaaaaaaaaaaa"
    }
    enable_proxy = true
    name_prefix  = "ustc-prod"
    tags         = { Environment = "prod" }
  }

  assert {
    condition     = aws_nat_gateway.this["us-east-1a"].allocation_id == "eipalloc-0aaaaaaaaaaaaaaaa"
    error_message = "pinned AZ's NAT gateway must reuse the provided allocation ID"
  }

  # No new EIP for the pinned AZ — the regression guard.
  assert {
    condition     = !contains(keys(aws_eip.nat), "us-east-1a")
    error_message = "no new EIP should be created for a pinned AZ"
  }

  assert {
    condition     = length(aws_eip.nat) == 1
    error_message = "only the unpinned AZ should allocate a new EIP"
  }

  assert {
    condition     = contains(keys(aws_eip.nat), "us-east-1b")
    error_message = "the unpinned AZ should have a newly-created EIP"
  }
}

# Both AZs pinned (prod-like): zero EIPs created — the strongest egress-IP-churn guard.
run "nat_eip_pinning_both_azs_creates_no_new_eips" {
  command = plan

  variables {
    vpc_cidr             = "10.0.0.0/16"
    availability_zones   = ["us-east-1a", "us-east-1b"]
    single_nat_gateway   = false
    public_subnet_cidrs  = ["10.0.1.0/24", "10.0.11.0/24"]
    private_subnet_cidrs = ["10.0.2.0/24", "10.0.12.0/24"]
    nat_eip_allocation_ids = {
      "us-east-1a" = "eipalloc-0aaaaaaaaaaaaaaaa"
      "us-east-1b" = "eipalloc-0bbbbbbbbbbbbbbbb"
    }
    enable_proxy = true
    name_prefix  = "ustc-prod"
    tags         = { Environment = "prod" }
  }

  assert {
    condition     = aws_nat_gateway.this["us-east-1a"].allocation_id == "eipalloc-0aaaaaaaaaaaaaaaa"
    error_message = "us-east-1a NAT must reuse its pinned allocation ID"
  }

  assert {
    condition     = aws_nat_gateway.this["us-east-1b"].allocation_id == "eipalloc-0bbbbbbbbbbbbbbbb"
    error_message = "us-east-1b NAT must reuse its pinned allocation ID"
  }

  assert {
    condition     = length(aws_eip.nat) == 0
    error_message = "when every egress AZ is pinned, the module must create no new EIPs"
  }
}

# Single-NAT mode (default): one NAT in the first AZ, shared by all private subnets.
run "single_nat_gateway_shares_one_egress_across_azs" {
  command = plan

  variables {
    vpc_cidr             = "10.0.0.0/16"
    availability_zones   = ["us-east-1a", "us-east-1b"]
    single_nat_gateway   = true
    public_subnet_cidrs  = ["10.0.1.0/24"]
    private_subnet_cidrs = ["10.0.2.0/24", "10.0.12.0/24"]
    enable_proxy         = true
    name_prefix          = "ustc-dev"
    tags                 = { Environment = "dev" }
  }

  assert {
    condition     = length(aws_nat_gateway.this) == 1
    error_message = "single-NAT mode should provision exactly one NAT gateway even with multiple AZs"
  }

  assert {
    condition     = length(aws_subnet.public) == 1 && length(aws_subnet.private) == 2
    error_message = "single-NAT mode should place a public subnet only in the egress AZ, private subnets in every AZ"
  }

  # 2 associations sharing 1 route table => both private subnets egress via the one NAT.
  # (Exact route_table_id match is unknowable under a mocked plan.)
  assert {
    condition     = length(aws_route_table.private) == 1 && length(aws_route_table_association.private) == 2
    error_message = "single-NAT mode should route both private subnets through the one egress route table"
  }
}

# Single-AZ deployment with the proxy disabled.
run "single_az_disables_proxy_keeps_rds" {
  command = plan

  variables {
    vpc_cidr             = "10.0.0.0/16"
    availability_zones   = ["us-east-1a"]
    single_nat_gateway   = true
    public_subnet_cidrs  = ["10.0.1.0/24"]
    private_subnet_cidrs = ["10.0.2.0/24"]
    enable_proxy         = false
    name_prefix          = "ustc-dev"
    tags                 = { Environment = "dev" }
  }

  assert {
    condition     = length(aws_security_group.proxy) == 0
    error_message = "proxy security group should not exist when enable_proxy is false"
  }

  assert {
    condition     = output.proxy_security_group_id == null
    error_message = "proxy_security_group_id output should be null when the proxy is disabled"
  }

  # RDS is unconditional — still present in a single-AZ, proxy-less stack.
  assert {
    condition     = output.db_subnet_group_name == "ustc-dev-db-subnet-group"
    error_message = "db subnet group should still be created in a single-AZ deployment"
  }

  assert {
    condition     = length(output.private_subnet_ids) == 1
    error_message = "a single-AZ deployment should expose exactly one private subnet"
  }

  assert {
    condition     = length(aws_nat_gateway.this) == 1 && length(aws_eip.nat) == 1
    error_message = "a single-AZ deployment should have one NAT gateway and one (unpinned) EIP"
  }
}

# Guardrails (expect_failures) — each protects an apply-only footgun.

# enable_proxy requires two AZs.
run "proxy_requires_two_azs" {
  command = plan

  variables {
    vpc_cidr             = "10.0.0.0/16"
    availability_zones   = ["us-east-1a"]
    single_nat_gateway   = true
    public_subnet_cidrs  = ["10.0.1.0/24"]
    private_subnet_cidrs = ["10.0.2.0/24"]
    enable_proxy         = true
    name_prefix          = "ustc-dev"
    tags                 = { Environment = "dev" }
  }

  expect_failures = [aws_security_group.proxy]
}

# A typo'd AZ key must be rejected, else it's ignored and a new EIP is allocated.
run "rejects_nat_eip_allocation_for_unknown_az" {
  command = plan

  variables {
    vpc_cidr             = "10.0.0.0/16"
    availability_zones   = ["us-east-1a", "us-east-1b"]
    single_nat_gateway   = false
    public_subnet_cidrs  = ["10.0.1.0/24", "10.0.11.0/24"]
    private_subnet_cidrs = ["10.0.2.0/24", "10.0.12.0/24"]
    nat_eip_allocation_ids = {
      "us-east-1z" = "eipalloc-0aaaaaaaaaaaaaaaa"
    }
    enable_proxy = false
    name_prefix  = "ustc-prod"
    tags         = { Environment = "prod" }
  }

  expect_failures = [var.nat_eip_allocation_ids]
}

# private_subnet_cidrs must be index-aligned with availability_zones, or zipmap drops subnets.
run "rejects_mismatched_private_subnet_cidrs" {
  command = plan

  variables {
    vpc_cidr             = "10.0.0.0/16"
    availability_zones   = ["us-east-1a", "us-east-1b"]
    single_nat_gateway   = true
    public_subnet_cidrs  = ["10.0.1.0/24"]
    private_subnet_cidrs = ["10.0.2.0/24"]
    enable_proxy         = false
    name_prefix          = "ustc-dev"
    tags                 = { Environment = "dev" }
  }

  expect_failures = [var.private_subnet_cidrs]
}
