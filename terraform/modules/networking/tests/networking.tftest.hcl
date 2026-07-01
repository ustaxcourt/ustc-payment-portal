mock_provider "aws" {}

run "two_private_subnets_enable_rds_and_proxy" {
  command = plan

  variables {
    vpc_cidr              = "10.0.0.0/16"
    availability_zone     = "us-east-1a"
    availability_zone_2   = "us-east-1b"
    public_subnet_cidr    = "10.0.1.0/24"
    private_subnet_cidr   = "10.0.2.0/24"
    private_subnet_cidr_2 = "10.0.3.0/24"
    enable_proxy          = true
    name_prefix           = "ustc-dev"
    tags = {
      Environment = "dev"
    }
  }

  assert {
    condition     = length(aws_db_subnet_group.rds) == 1
    error_message = "db subnet group should be created when second private subnet is configured"
  }

  assert {
    condition     = length(aws_security_group.proxy) == 1
    error_message = "proxy security group should be created when proxy is enabled"
  }

  assert {
    condition     = length(output.proxy_subnet_ids) == 2
    error_message = "proxy_subnet_ids should include both private subnets"
  }
}

run "single_private_subnet_disables_rds_proxy_components" {
  command = plan

  variables {
    vpc_cidr              = "10.0.0.0/16"
    availability_zone     = "us-east-1a"
    public_subnet_cidr    = "10.0.1.0/24"
    private_subnet_cidr   = "10.0.2.0/24"
    private_subnet_cidr_2 = ""
    enable_proxy          = false
    name_prefix           = "ustc-dev"
    tags = {
      Environment = "dev"
    }
  }

  assert {
    condition     = output.db_subnet_group_name == null
    error_message = "db_subnet_group_name should be null without a second private subnet"
  }

  assert {
    condition     = output.proxy_security_group_id == null
    error_message = "proxy_security_group_id should be null when proxy is disabled"
  }

  assert {
    condition     = length(output.proxy_subnet_ids) == 1
    error_message = "proxy_subnet_ids should contain only the primary private subnet"
  }
}

run "proxy_requires_second_az" {
  command = plan

  variables {
    vpc_cidr              = "10.0.0.0/16"
    availability_zone     = "us-east-1a"
    availability_zone_2   = ""
    public_subnet_cidr    = "10.0.1.0/24"
    private_subnet_cidr   = "10.0.2.0/24"
    private_subnet_cidr_2 = "10.0.3.0/24"
    enable_proxy          = true
    name_prefix           = "ustc-dev"
    tags = {
      Environment = "dev"
    }
  }

  expect_failures = [aws_security_group.proxy]
}
