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


resource "aws_subnet" "public_subnet" {
  vpc_id            = aws_vpc.lambda_vpc.id
  cidr_block        = var.public_subnet_cidr
  availability_zone = var.availability_zone

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-public-subnet"
  })
}

resource "aws_subnet" "private_subnet" {
  vpc_id            = aws_vpc.lambda_vpc.id
  cidr_block        = var.private_subnet_cidr
  availability_zone = var.availability_zone

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-private-subnet"
  })
}

#keeping it here in case we've to rollback to the original EIP

# resource "aws_eip" "nat" {
#   domain = "vpc"

#   tags = merge(var.tags, {
#     Name = "${var.name_prefix}-eip"
#   })
# }

resource "aws_eip" "nat_replacement" {
  domain = "vpc"
  
  tags = merge(var.tags, {
    Name = "${var.name_prefix}-replacement-eip"
  })
  
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_nat_gateway" "default_nat_gw" {
  subnet_id     = aws_subnet.public_subnet.id
  allocation_id = aws_eip.nat_replacement.id
  tags = merge(var.tags, {
    Name = "${var.name_prefix}-nat-gw"
  })
}


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


resource "aws_route_table" "private_rt" {
  vpc_id = aws_vpc.lambda_vpc.id

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-private-rt"
  })
}


resource "aws_route" "private_default_route" {
  route_table_id         = aws_route_table.private_rt.id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.default_nat_gw.id
}


resource "aws_route_table_association" "public_rta" {
  subnet_id      = aws_subnet.public_subnet.id
  route_table_id = aws_route_table.public_rt.id
}


resource "aws_route_table_association" "private_rta" {
  subnet_id      = aws_subnet.private_subnet.id
  route_table_id = aws_route_table.private_rt.id
}


resource "aws_security_group" "lambda" {
  name   = "lambda-SG"
  vpc_id = aws_vpc.lambda_vpc.id
  ingress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
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
