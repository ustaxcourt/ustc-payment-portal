mock_provider "aws" {}

override_data {
  target = data.aws_iam_policy_document.assume_role
  values = {
    json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":[\"sts:AssumeRole\"],\"Principal\":{\"Service\":[\"rds.amazonaws.com\"]}}]}"
  }
}

run "builds_proxy_with_expected_wiring" {
  command = plan

  variables {
    name                    = "ustc-payment-portal-dev-proxy"
    secret_arn              = "arn:aws:secretsmanager:us-east-1:123456789012:secret:ustc/pay-gov/dev/rds-credentials-abcdef"
    rds_instance_identifier = "ustc-payment-portal-dev"
    vpc_subnet_ids          = ["subnet-111111", "subnet-222222"]
    vpc_security_group_ids  = ["sg-111111"]
  }

  assert {
    condition     = aws_db_proxy.this.name == "ustc-payment-portal-dev-proxy"
    error_message = "proxy name should match the name input"
  }

  assert {
    condition     = aws_db_proxy.this.engine_family == "POSTGRESQL"
    error_message = "proxy should use the POSTGRESQL engine family"
  }

  assert {
    condition     = aws_iam_role.proxy.name == "ustc-payment-portal-dev-proxy-role"
    error_message = "proxy IAM role should use the -role suffix convention"
  }

  assert {
    condition     = aws_db_proxy_default_target_group.this.connection_pool_config[0].max_connections_percent == 75
    error_message = "max_connections_percent should default to 75"
  }

  assert {
    condition     = output.port == 5432
    error_message = "port output should default to 5432"
  }
}

run "require_tls_defaults_true" {
  command = plan

  variables {
    name                    = "ustc-payment-portal-prod-proxy"
    secret_arn              = "arn:aws:secretsmanager:us-east-1:123456789012:secret:rds!abcdef"
    rds_instance_identifier = "ustc-payment-portal-prod"
    vpc_subnet_ids          = ["subnet-111111", "subnet-222222"]
    vpc_security_group_ids  = ["sg-111111"]
  }

  assert {
    condition     = aws_db_proxy.this.require_tls == true
    error_message = "require_tls should default to true"
  }
}

run "rejects_single_subnet" {
  command = plan

  variables {
    name                    = "ustc-payment-portal-dev-proxy"
    secret_arn              = "arn:aws:secretsmanager:us-east-1:123456789012:secret:ustc/pay-gov/dev/rds-credentials-abcdef"
    rds_instance_identifier = "ustc-payment-portal-dev"
    vpc_subnet_ids          = ["subnet-111111"]
    vpc_security_group_ids  = ["sg-111111"]
  }

  expect_failures = [var.vpc_subnet_ids]
}

run "rejects_idle_percent_above_max" {
  command = plan

  variables {
    name                         = "ustc-payment-portal-dev-proxy"
    secret_arn                   = "arn:aws:secretsmanager:us-east-1:123456789012:secret:ustc/pay-gov/dev/rds-credentials-abcdef"
    rds_instance_identifier      = "ustc-payment-portal-dev"
    vpc_subnet_ids               = ["subnet-111111", "subnet-222222"]
    vpc_security_group_ids       = ["sg-111111"]
    max_connections_percent      = 50
    max_idle_connections_percent = 80
  }

  expect_failures = [var.max_idle_connections_percent]
}
