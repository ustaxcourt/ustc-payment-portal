mock_provider "aws" {}

variables {
  engine_version = "17"
}

run "major_only_version_derives_family_and_group_name" {
  command = plan

  variables {
    identifier             = "ustc-payments-dev"
    db_name                = "payments"
    username               = "portal"
    password               = "fake-not-a-real-password"
    vpc_security_group_ids = ["sg-1234567890"]
    db_subnet_group_name   = "db-subnet-group"
  }

  assert {
    condition     = aws_db_parameter_group.main.family == "postgres17"
    error_message = "family should be derived from the engine major version"
  }

  assert {
    condition     = aws_db_parameter_group.main.name == "ustc-payments-dev-pg17"
    error_message = "a non-16 parameter group name should carry the major version so it can be created before the old one is destroyed"
  }

  assert {
    condition     = aws_db_instance.main.engine_version == "17"
    error_message = "engine_version should pass through unchanged"
  }

  assert {
    condition     = aws_db_instance.main.allow_major_version_upgrade == true
    error_message = "allow_major_version_upgrade must be true or a major bump is rejected"
  }

  assert {
    condition     = aws_db_instance.main.apply_immediately == true
    error_message = "apply_immediately must be true or the upgrade is deferred to the maintenance window"
  }
}

run "explicit_minor_derives_family" {
  command = plan

  variables {
    identifier             = "ustc-payments-dev"
    db_name                = "payments"
    username               = "portal"
    password               = "fake-not-a-real-password"
    vpc_security_group_ids = ["sg-1234567890"]
    db_subnet_group_name   = "db-subnet-group"
    engine_version         = "17.6"
  }

  assert {
    condition     = aws_db_parameter_group.main.family == "postgres17"
    error_message = "family should ignore the minor version"
  }
}

run "pg16_keeps_legacy_group_name" {
  command = plan

  variables {
    identifier             = "ustc-payments-dev"
    db_name                = "payments"
    username               = "portal"
    password               = "fake-not-a-real-password"
    vpc_security_group_ids = ["sg-1234567890"]
    db_subnet_group_name   = "db-subnet-group"
    engine_version         = "16"
  }

  assert {
    condition     = aws_db_parameter_group.main.name == "ustc-payments-dev-pg"
    error_message = "16 must keep the existing group name so in-use groups are not replaced"
  }

  assert {
    condition     = aws_db_parameter_group.main.family == "postgres16"
    error_message = "family should be postgres16"
  }
}

run "rejects_invalid_engine_version" {
  command = plan

  variables {
    identifier             = "ustc-payments-dev"
    db_name                = "payments"
    username               = "portal"
    password               = "fake-not-a-real-password"
    vpc_security_group_ids = ["sg-1234567890"]
    db_subnet_group_name   = "db-subnet-group"
    engine_version         = "postgres17"
  }

  expect_failures = [var.engine_version]
}

run "default_branch_uses_inline_password" {
  command = plan

  variables {
    identifier             = "ustc-payments-dev"
    db_name                = "payments"
    username               = "portal"
    password               = "fake-not-a-real-password"
    vpc_security_group_ids = ["sg-1234567890"]
    db_subnet_group_name   = "db-subnet-group"
  }

  assert {
    condition     = output.instance_identifier == "ustc-payments-dev"
    error_message = "instance_identifier output should match identifier input"
  }

  assert {
    condition     = aws_db_instance.main.manage_master_user_password == null
    error_message = "manage_master_user_password should be omitted when disabled"
  }

  assert {
    condition     = aws_db_instance.main.max_allocated_storage == null
    error_message = "max_allocated_storage should be null when disabled (0)"
  }
}

run "pay_059_managed_password_omits_inline_password" {
  command = plan

  variables {
    identifier                  = "ustc-payments-dev"
    db_name                     = "payments"
    username                    = "portal"
    password                    = "should-be-ignored"
    manage_master_user_password = true
    vpc_security_group_ids      = ["sg-1234567890"]
    db_subnet_group_name        = "db-subnet-group"
  }

  assert {
    condition     = aws_db_instance.main.password == null
    error_message = "PAY-059 regression: password must be null when manage_master_user_password is true"
  }

  assert {
    condition     = aws_db_instance.main.manage_master_user_password == true
    error_message = "manage_master_user_password should be true when enabled"
  }
}

run "max_allocated_storage_branch_enabled" {
  command = plan

  variables {
    identifier             = "ustc-payments-dev"
    db_name                = "payments"
    username               = "portal"
    password               = "fake-not-a-real-password"
    max_allocated_storage  = 200
    vpc_security_group_ids = ["sg-1234567890"]
    db_subnet_group_name   = "db-subnet-group"
  }

  assert {
    condition     = aws_db_instance.main.max_allocated_storage == 200
    error_message = "max_allocated_storage should be populated when configured"
  }
}

run "rejects_invalid_log_statement" {
  command = plan

  variables {
    identifier             = "ustc-payments-dev"
    db_name                = "payments"
    username               = "portal"
    password               = "fake-not-a-real-password"
    vpc_security_group_ids = ["sg-1234567890"]
    db_subnet_group_name   = "db-subnet-group"
    log_statement          = "invalid"
  }

  expect_failures = [var.log_statement]
}

run "requires_final_snapshot_identifier_when_not_skipping" {
  command = plan

  variables {
    identifier             = "ustc-payments-dev"
    db_name                = "payments"
    username               = "portal"
    password               = "fake-not-a-real-password"
    vpc_security_group_ids = ["sg-1234567890"]
    db_subnet_group_name   = "db-subnet-group"
    skip_final_snapshot    = false
  }

  expect_failures = [var.final_snapshot_identifier]
}
