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

# When a CMK is provided, kms:Decrypt is scoped to that key ARN (not "*").
run "secret_kms_key_arn_scopes_kms_policy" {
  command = plan

  variables {
    name                    = "ustc-payment-portal-prod-proxy"
    secret_arn              = "arn:aws:secretsmanager:us-east-1:123456789012:secret:rds!abcdef"
    rds_instance_identifier = "ustc-payment-portal-prod"
    vpc_subnet_ids          = ["subnet-111111", "subnet-222222"]
    vpc_security_group_ids  = ["sg-111111"]
    secret_kms_key_arn      = "arn:aws:kms:us-east-1:123456789012:key/abcd-1234"
  }

  assert {
    condition     = strcontains(aws_iam_role_policy.secret_access.policy, "arn:aws:kms:us-east-1:123456789012:key/abcd-1234")
    error_message = "kms:Decrypt should be scoped to the provided CMK ARN"
  }

  assert {
    condition     = !strcontains(aws_iam_role_policy.secret_access.policy, "\"Resource\":\"*\"")
    error_message = "no statement should use Resource \"*\" when a CMK is provided"
  }
}

# When secret_kms_key_arn is null, kms:Decrypt falls back to "*" with kms:ViaService scoping.
run "secret_kms_key_arn_null_uses_via_service" {
  command = plan

  variables {
    name                    = "ustc-payment-portal-dev-proxy"
    secret_arn              = "arn:aws:secretsmanager:us-east-1:123456789012:secret:ustc/pay-gov/dev/rds-credentials-abcdef"
    rds_instance_identifier = "ustc-payment-portal-dev"
    vpc_subnet_ids          = ["subnet-111111", "subnet-222222"]
    vpc_security_group_ids  = ["sg-111111"]
  }

  assert {
    condition     = strcontains(aws_iam_role_policy.secret_access.policy, "kms:ViaService")
    error_message = "kms:Decrypt should include kms:ViaService when using the AWS-managed key path"
  }

  assert {
    condition     = strcontains(aws_iam_role_policy.secret_access.policy, "\"Resource\":\"*\"")
    error_message = "kms:Decrypt should use Resource \"*\" when no CMK is provided"
  }
}

run "max_connections_percent_wires_custom_value" {
  command = plan

  variables {
    name                    = "ustc-payment-portal-dev-proxy"
    secret_arn              = "arn:aws:secretsmanager:us-east-1:123456789012:secret:ustc/pay-gov/dev/rds-credentials-abcdef"
    rds_instance_identifier = "ustc-payment-portal-dev"
    vpc_subnet_ids          = ["subnet-111111", "subnet-222222"]
    vpc_security_group_ids  = ["sg-111111"]
    max_connections_percent = 42
  }

  assert {
    condition     = aws_db_proxy_default_target_group.this.connection_pool_config[0].max_connections_percent == 42
    error_message = "max_connections_percent should pass through to the proxy target group"
  }
}

run "accepts_max_connections_percent_at_lower_bound" {
  command = plan

  variables {
    name                    = "ustc-payment-portal-dev-proxy"
    secret_arn              = "arn:aws:secretsmanager:us-east-1:123456789012:secret:ustc/pay-gov/dev/rds-credentials-abcdef"
    rds_instance_identifier = "ustc-payment-portal-dev"
    vpc_subnet_ids          = ["subnet-111111", "subnet-222222"]
    vpc_security_group_ids  = ["sg-111111"]
    max_connections_percent = 1
  }

  assert {
    condition     = aws_db_proxy_default_target_group.this.connection_pool_config[0].max_connections_percent == 1
    error_message = "max_connections_percent should accept the lower bound of 1"
  }
}

run "accepts_max_connections_percent_at_upper_bound" {
  command = plan

  variables {
    name                    = "ustc-payment-portal-dev-proxy"
    secret_arn              = "arn:aws:secretsmanager:us-east-1:123456789012:secret:ustc/pay-gov/dev/rds-credentials-abcdef"
    rds_instance_identifier = "ustc-payment-portal-dev"
    vpc_subnet_ids          = ["subnet-111111", "subnet-222222"]
    vpc_security_group_ids  = ["sg-111111"]
    max_connections_percent = 100
  }

  assert {
    condition     = aws_db_proxy_default_target_group.this.connection_pool_config[0].max_connections_percent == 100
    error_message = "max_connections_percent should accept the upper bound of 100"
  }
}

run "rejects_max_connections_percent_zero" {
  command = plan

  variables {
    name                    = "ustc-payment-portal-dev-proxy"
    secret_arn              = "arn:aws:secretsmanager:us-east-1:123456789012:secret:ustc/pay-gov/dev/rds-credentials-abcdef"
    rds_instance_identifier = "ustc-payment-portal-dev"
    vpc_subnet_ids          = ["subnet-111111", "subnet-222222"]
    vpc_security_group_ids  = ["sg-111111"]
    max_connections_percent = 0
  }

  expect_failures = [var.max_connections_percent]
}

run "rejects_max_connections_percent_over_100" {
  command = plan

  variables {
    name                    = "ustc-payment-portal-dev-proxy"
    secret_arn              = "arn:aws:secretsmanager:us-east-1:123456789012:secret:ustc/pay-gov/dev/rds-credentials-abcdef"
    rds_instance_identifier = "ustc-payment-portal-dev"
    vpc_subnet_ids          = ["subnet-111111", "subnet-222222"]
    vpc_security_group_ids  = ["sg-111111"]
    max_connections_percent = 101
  }

  expect_failures = [var.max_connections_percent]
}

# RDS Proxy names are capped at 60 chars; name allows 1-59 so the -role IAM suffix stays within IAM limits.
run "accepts_name_at_max_length" {
  command = plan

  variables {
    name                    = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    secret_arn              = "arn:aws:secretsmanager:us-east-1:123456789012:secret:ustc/pay-gov/dev/rds-credentials-abcdef"
    rds_instance_identifier = "ustc-payment-portal-dev"
    vpc_subnet_ids          = ["subnet-111111", "subnet-222222"]
    vpc_security_group_ids  = ["sg-111111"]
  }

  assert {
    condition     = length(aws_db_proxy.this.name) == 59
    error_message = "proxy name should accept the 59-character maximum"
  }

  assert {
    condition     = aws_iam_role.proxy.name == "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-role"
    error_message = "IAM role name should append -role to the max-length proxy name"
  }
}

run "rejects_name_over_max_length" {
  command = plan

  variables {
    name                    = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    secret_arn              = "arn:aws:secretsmanager:us-east-1:123456789012:secret:ustc/pay-gov/dev/rds-credentials-abcdef"
    rds_instance_identifier = "ustc-payment-portal-dev"
    vpc_subnet_ids          = ["subnet-111111", "subnet-222222"]
    vpc_security_group_ids  = ["sg-111111"]
  }

  expect_failures = [var.name]
}

run "rejects_empty_name" {
  command = plan

  variables {
    name                    = ""
    secret_arn              = "arn:aws:secretsmanager:us-east-1:123456789012:secret:ustc/pay-gov/dev/rds-credentials-abcdef"
    rds_instance_identifier = "ustc-payment-portal-dev"
    vpc_subnet_ids          = ["subnet-111111", "subnet-222222"]
    vpc_security_group_ids  = ["sg-111111"]
  }

  expect_failures = [var.name]
}
