locals {
  rds_identifier = "payment-portal-${local.environment}"
  rds_db_name   = "payment_portal"
  rds_username  = "payment_portal_admin"
}

resource "aws_db_subnet_group" "main" {
  name       = "${local.rds_identifier}-subnet-group"
  subnet_ids = data.terraform_remote_state.foundation.outputs.private_subnet_ids

  tags = {
    Name    = local.rds_identifier
    Env     = local.environment
    Project = "ustc-payment-portal"
  }
}

resource "aws_security_group" "rds" {
  name        = "${local.rds_identifier}-sg"
  description = "Allow PostgreSQL from Lambda"
  vpc_id      = data.terraform_remote_state.foundation.outputs.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [data.terraform_remote_state.foundation.outputs.lambda_security_group_id]
    description     = "PostgreSQL from Lambda"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound"
  }

  tags = {
    Name    = "${local.rds_identifier}-sg"
    Env     = local.environment
    Project = "ustc-payment-portal"
  }
}

resource "random_password" "rds_master" {
  length  = 32
  special = true
}

module "rds" {
  source = "../../modules/rds"

  identifier     = local.rds_identifier
  db_name        = local.rds_db_name
  username       = local.rds_username
  password       = random_password.rds_master.result

  instance_class         = "db.t3.small"
  allocated_storage      = 20
  backup_retention_period = 7
  multi_az               = false

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  deletion_protection = false
}
