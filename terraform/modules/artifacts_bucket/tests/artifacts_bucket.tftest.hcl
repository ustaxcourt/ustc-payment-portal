mock_provider "aws" {}

run "bucket_hardening_defaults" {
  command = plan

  variables {
    build_artifacts_bucket_name = "ustc-payment-portal-build-artifacts"
    deployer_role_arn           = "arn:aws:iam::123456789012:role/dev-deployer"
    staging_deployer_role_arn   = "arn:aws:iam::123456789012:role/stg-deployer"
    prod_deployer_role_arn      = "arn:aws:iam::123456789012:role/prod-deployer"
  }

  assert {
    condition     = aws_s3_bucket.build_artifacts.bucket == var.build_artifacts_bucket_name
    error_message = "bucket resource should use configured bucket name"
  }

  assert {
    condition     = aws_s3_bucket_versioning.build_artifacts.versioning_configuration[0].status == "Enabled"
    error_message = "artifact bucket versioning should be enabled"
  }

  assert {
    condition     = aws_s3_bucket.build_artifacts.tags["ManagedBy"] == "terraform"
    error_message = "artifact bucket should carry ManagedBy=terraform tag"
  }

  assert {
    condition     = aws_s3_bucket_public_access_block.build_artifacts.block_public_policy && aws_s3_bucket_public_access_block.build_artifacts.block_public_acls
    error_message = "artifact bucket should block public ACLs and policies"
  }

  assert {
    condition     = aws_s3_bucket_public_access_block.build_artifacts.ignore_public_acls && aws_s3_bucket_public_access_block.build_artifacts.restrict_public_buckets
    error_message = "artifact bucket should ignore public ACLs and restrict public bucket policies"
  }

  assert {
    condition     = one(one(aws_s3_bucket_server_side_encryption_configuration.build_artifacts.rule).apply_server_side_encryption_by_default).sse_algorithm == "AES256"
    error_message = "artifact bucket should enforce AES256 server-side encryption at rest"
  }
}
