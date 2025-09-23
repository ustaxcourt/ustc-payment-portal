resource "aws_vpc" "lambda_vpc" {
  cidr_block       = var.vpc_cidr           # This IP address is 10.20.0.0/25  --> 126 available IP addresses
  enable_dns_support = true
  enable_dns_hostnames = true

  tags = {
    Name = "LambdaVPC-Dev"
  }
}

resource "aws_internet_gateway" "lambda_igw" {
  vpc_id = aws_vpc.lambda_vpc.id

  tags = {
    Name = "LambdaIGW-Dev"
  }
}


resource "aws_subnet" "public_subnet" {
  vpc_id     = aws_vpc.lambda_vpc.id
  cidr_block = "10.20.0.0/28"          # MAKE THIS DYNAMIC
  availability_zone = var.availability_zone

  tags = {
    Name = "PublicSubnet"
  }
}

resource "aws_subnet" "private_subnet" {
  vpc_id     = aws_vpc.lambda_vpc.id
  cidr_block = "10.20.0.32/28"          # MAKE THIS DYNAMIC
  availability_zone = var.availability_zone

  tags = {
    Name = "PublicSubnet"
  }
}

resource "aws_eip" "nat" {
  domain = "vpc"

  tags = {
    Name = "EIP"
  }
}


resource "aws_nat_gateway" "default" {
  subnet_id = aws_subnet.public_subnet.id
  allocation_id = aws_eip.nat.id
  tags = {
    Name = "gw NAT"
  }
}


resource "aws_route_table" "public" {
  vpc_id = aws_vpc.lambda_vpc.id

  tags = {
    Name = "PublicRouteTable"
  }
}


resource "aws_route" "public_default" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.lambda_igw.id
}


resource "aws_route_table" "private" {
  vpc_id = aws_vpc.lambda_vpc.id

  tags = {
    Name = "PrivateRouteTable"
  }
}


resource "aws_route" "private_default" {
  route_table_id         = aws_route_table.private.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_nat_gateway.default.id
}


resource "aws_route_table_association" "public_rta" {
  subnet_id      = aws_subnet.public_subnet.id
  route_table_id = aws_route_table.public.id
}


resource "aws_route_table_association" "private_rta" {
  subnet_id      = aws_subnet.private_subnet.id
  route_table_id = aws_route_table.private.id
}


resource "aws_security_group" "lambda" {
  name = "lambda-SG"
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

  tags = {
    Name = "Lambda Security Group"
  }
}