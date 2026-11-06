mock_provider "aws" {}

variables {
  engine_version = "18.6"
}

run "pinned_version_derives_family_and_group_name" {
  command = plan

  variables {
    identifier             = "ustc-payments-dev"
    db_name                = "payments"
    username               = "portal"
    password               = "fake-not-a-real-password"
    vpc_security_group_ids = ["sg-1234567890"]
    db_subnet_group_name   = "db-subnet-group"
    apply_immediately      = true
  }

  assert {
    condition     = aws_db_parameter_group.main.family == "postgres18"
    error_message = "family should be derived from the engine major version"
  }

  assert {
    condition     = aws_db_parameter_group.main.name == "ustc-payments-dev-pg18"
    error_message = "the parameter group name should carry the major version so it can be created before the old one is destroyed"
  }

  assert {
    condition     = aws_db_instance.main.engine_version == "18.6"
    error_message = "engine_version should pass through unchanged"
  }

  assert {
    condition     = aws_db_instance.main.auto_minor_version_upgrade == false
    error_message = "auto_minor_version_upgrade must be false, or AWS moves the instance off its pinned version"
  }

  assert {
    condition     = aws_db_instance.main.allow_major_version_upgrade == true
    error_message = "allow_major_version_upgrade must be true or a major bump is rejected"
  }

  assert {
    condition     = aws_db_instance.main.apply_immediately == true
    error_message = "apply_immediately should pass through so an upgrading environment is not deferred to the maintenance window"
  }

  assert {
    condition     = [for p in aws_db_parameter_group.main.parameter : p.value if p.name == "log_connections"] == ["all"]
    error_message = "18 rejects the boolean \"1\" for log_connections; it must be a list value such as \"all\""
  }
}

run "apply_immediately_defaults_to_false" {
  command = plan

  variables {
    identifier             = "ustc-payments-stg"
    db_name                = "payments"
    username               = "portal"
    password               = "fake-not-a-real-password"
    vpc_security_group_ids = ["sg-1234567890"]
    db_subnet_group_name   = "db-subnet-group"
  }

  assert {
    condition     = aws_db_instance.main.apply_immediately == false
    error_message = "apply_immediately should default to false so environments not being upgraded keep using the maintenance window"
  }
}

run "rejects_major_only_engine_version" {
  command = plan

  variables {
    identifier             = "ustc-payments-dev"
    db_name                = "payments"
    username               = "portal"
    password               = "fake-not-a-real-password"
    vpc_security_group_ids = ["sg-1234567890"]
    db_subnet_group_name   = "db-subnet-group"
    engine_version         = "18"
  }

  expect_failures = [var.engine_version]
}

run "rollback_pin_derives_pg16_group" {
  command = plan

  variables {
    identifier             = "ustc-payments-dev"
    db_name                = "payments"
    username               = "portal"
    password               = "fake-not-a-real-password"
    vpc_security_group_ids = ["sg-1234567890"]
    db_subnet_group_name   = "db-subnet-group"
    engine_version         = "16.13"
  }

  assert {
    condition     = aws_db_parameter_group.main.family == "postgres16"
    error_message = "family should ignore the minor version"
  }

  assert {
    condition     = aws_db_parameter_group.main.name == "ustc-payments-dev-pg16"
    error_message = "the runbook's rollback expects a 16.x pin to create -pg16, not reuse the destroyed -pg"
  }

  assert {
    condition     = [for p in aws_db_parameter_group.main.parameter : p.value if p.name == "log_connections"] == ["1"]
    error_message = "16 only accepts a boolean log_connections; a 16.x rollback depends on \"1\""
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
    engine_version         = "postgres18"
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
