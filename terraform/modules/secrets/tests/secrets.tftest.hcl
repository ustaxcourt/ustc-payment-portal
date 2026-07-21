mock_provider "aws" {}

run "defaults_create_mtls_and_rds_secret" {
  command = plan

  variables {
    environment = "dev"
    tags = {
      Team = "payments"
    }
  }

  assert {
    condition     = output.private_key_secret_id != null
    error_message = "private_key_secret_id should be present when mTLS is enabled"
  }

  assert {
    condition     = output.certificate_secret_id != null
    error_message = "certificate_secret_id should be present when mTLS is enabled"
  }

  assert {
    condition     = output.rds_credentials_secret_id != null
    error_message = "rds_credentials_secret_id should be present when create_rds_secret is true"
  }

  assert {
    condition     = startswith(output.cert_passphrase_secret_id, "ustc/pay-gov/dev/")
    error_message = "secret names should be prefixed with environment-specific basepath"
  }
}

run "disabling_mtls_and_rds_secret_omits_resources" {
  command = plan

  variables {
    environment       = "prod"
    enable_mtls       = false
    create_rds_secret = false
  }

  assert {
    condition     = output.private_key_secret_id == null
    error_message = "private_key_secret_id should be null when mTLS is disabled"
  }

  assert {
    condition     = output.certificate_secret_id == null
    error_message = "certificate_secret_id should be null when mTLS is disabled"
  }

  assert {
    condition     = output.rds_credentials_secret_id == null
    error_message = "rds_credentials_secret_id should be null when create_rds_secret is false"
  }
}

run "rejects_invalid_recovery_window" {
  command = plan

  variables {
    environment             = "dev"
    recovery_window_in_days = 5
  }

  expect_failures = [var.recovery_window_in_days]
}
