locals {
  # Build index-aligned maps keyed by AZ name for use with for_each.
  public_subnets  = zipmap(var.availability_zones, var.public_subnet_cidrs)
  private_subnets = zipmap(var.availability_zones, var.private_subnet_cidrs)

  # For each AZ that does NOT have an existing EIP allocation provided, we will
  # create a new EIP.  AZs listed in nat_eip_allocation_ids skip EIP creation.
  azs_needing_eip = toset([
    for az in var.availability_zones : az
    if !contains(keys(var.nat_eip_allocation_ids), az)
  ])

  # Resolve the allocation ID each AZ's NAT gateway should use.
  nat_allocation_by_az = {
    for az in var.availability_zones :
    az => contains(keys(var.nat_eip_allocation_ids), az) ?
    var.nat_eip_allocation_ids[az] :
    aws_eip.nat[az].id
  }
}

resource "aws_vpc" "lambda_vpc" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-vpc"
  })
}

resource "aws_internet_gateway" "lambda_igw" {
  vpc_id = aws_vpc.lambda_vpc.id

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-igw"
  })
}

# ---------------------------------------------------------------------------
# Subnets — one public + one private per AZ
# ---------------------------------------------------------------------------

resource "aws_subnet" "public" {
  for_each = local.public_subnets

  vpc_id            = aws_vpc.lambda_vpc.id
  cidr_block        = each.value
  availability_zone = each.key

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-public-subnet-${each.key}"
  })
}

resource "aws_subnet" "private" {
  for_each = local.private_subnets

  vpc_id            = aws_vpc.lambda_vpc.id
  cidr_block        = each.value
  availability_zone = each.key

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-private-subnet-${each.key}"
  })
}

# ---------------------------------------------------------------------------
# RDS subnet group and security group (unconditional — both AZs always present)
# ---------------------------------------------------------------------------

resource "aws_db_subnet_group" "rds" {
  name = "${var.name_prefix}-db-subnet-group"

  subnet_ids = [for az, subnet in aws_subnet.private : subnet.id]

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-db-subnet-group"
  })
}

resource "aws_security_group" "rds" {
  name        = "${var.name_prefix}-rds-sg"
  description = "Allow PostgreSQL from Lambda"
  vpc_id      = aws_vpc.lambda_vpc.id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.lambda.id]
    description     = "PostgreSQL from Lambda"
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-rds-sg"
  })
}

# ---------------------------------------------------------------------------
# Elastic IPs — created only for AZs without a pre-existing allocation
# ---------------------------------------------------------------------------

resource "aws_eip" "nat" {
  for_each = local.azs_needing_eip

  domain = "vpc"

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-eip-${each.key}"
  })

  lifecycle {
    prevent_destroy = true
  }
}

# ---------------------------------------------------------------------------
# NAT Gateways — one per AZ, placed in that AZ's public subnet
# ---------------------------------------------------------------------------

resource "aws_nat_gateway" "this" {
  for_each = toset(var.availability_zones)

  subnet_id     = aws_subnet.public[each.key].id
  allocation_id = local.nat_allocation_by_az[each.key]

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-nat-gw-${each.key}"
  })

  depends_on = [aws_internet_gateway.lambda_igw]
}

# ---------------------------------------------------------------------------
# Public route table (shared — all public subnets route to IGW)
# ---------------------------------------------------------------------------

resource "aws_route_table" "public_rt" {
  vpc_id = aws_vpc.lambda_vpc.id

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-public-rt"
  })
}

resource "aws_route" "public_default_route" {
  route_table_id         = aws_route_table.public_rt.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.lambda_igw.id
}

resource "aws_route_table_association" "public" {
  for_each = local.public_subnets

  subnet_id      = aws_subnet.public[each.key].id
  route_table_id = aws_route_table.public_rt.id
}

# ---------------------------------------------------------------------------
# Private route tables — one per AZ, each pointing to that AZ's NAT gateway
# ---------------------------------------------------------------------------

resource "aws_route_table" "private" {
  for_each = toset(var.availability_zones)

  vpc_id = aws_vpc.lambda_vpc.id

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-private-rt-${each.key}"
  })
}

resource "aws_route" "private_default" {
  for_each = toset(var.availability_zones)

  route_table_id         = aws_route_table.private[each.key].id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.this[each.key].id
}

resource "aws_route_table_association" "private" {
  for_each = local.private_subnets

  subnet_id      = aws_subnet.private[each.key].id
  route_table_id = aws_route_table.private[each.key].id
}

# ---------------------------------------------------------------------------
# Lambda security group
# ---------------------------------------------------------------------------

resource "aws_security_group" "lambda" {
  name   = "lambda-SG"
  vpc_id = aws_vpc.lambda_vpc.id
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-sg"
  })
}

