# PAY-049: Database Provisioning

## Summary

Provisioned a PostgreSQL 16.6 RDS instance across all environments (dev, stg, prod) via Terraform, with per-environment configuration and CI/CD pipeline support.

## What Was Done

### RDS Module (`terraform/modules/rds/`)

- Already existed with configurable `multi_az`, `deletion_protection`, and `skip_final_snapshot`
- Updated `engine_version` from `16.1` to `16.6` (AWS deprecated 16.1)
- Added CloudWatch log exports (`postgresql`, `upgrade`) and parameter group with logging (`log_statement = all`, `log_connections`, `log_disconnections`, `log_min_duration_statement = 1000`)

### IAM Permissions (`terraform/modules/iam/main.tf`)

- Added RDS read permissions (scoped to `*` as required by AWS): `DescribeDBInstances`, `DescribeDBSubnetGroups`, `DescribeDBSnapshots`, `DescribeDBParameterGroups`, `DescribeDBParameters`, `ListTagsForResource`
- Added RDS write permissions (scoped to project ARN patterns): `CreateDBInstance`, `DeleteDBInstance`, `ModifyDBInstance`, `AddTagsToResource`, `RemoveTagsFromResource`, `CreateDBSnapshot`, `DeleteDBSnapshot`, `CreateDBParameterGroup`, `DeleteDBParameterGroup`, `ModifyDBParameterGroup`
- Added `iam:CreateServiceLinkedRole` for `rds.amazonaws.com` (required for first RDS instance in an account)

### Environment Wiring

- **Dev** (`terraform/environments/dev/main.tf`): `module "rds"` with `multi_az = false`
- **Stg** (`terraform/environments/stg/main.tf`): `module "rds"` with `multi_az = false`
- **Prod** (`terraform/environments/prod/main.tf`): `module "rds"` with `multi_az = true`, `deletion_protection = true`, `skip_final_snapshot = false`
- All environments generate a `random_password` and store credentials in Secrets Manager via `aws_secretsmanager_secret_version`
- Added `RDS_ENDPOINT` to Lambda environment variables and `rds_endpoint` to Terraform outputs in all environments

### Secrets Manager Recovery Window (`terraform/modules/secrets/`)

- Added `recovery_window_in_days` variable to the secrets module with a safe default of `30` and input validation (must be `0` or `7-30`)
- Each environment passes its own value:
  - **Dev**: `0` (immediate deletion, required for PR workspace teardown/recreate cycles)
  - **Stg**: `30` (recoverable)
  - **Prod**: `30` (recoverable)
- This prevents PR pipeline re-creation conflicts while protecting staging and production secrets from accidental permanent deletion

### Networking

- Added second private subnet (`private_subnet_cidr_2`) in each foundation networking layer to satisfy the AWS requirement of at least two AZs for a DB subnet group
- Added `aws_db_subnet_group` and `aws_security_group` for RDS in the networking module
- RDS security group allows inbound TCP 5432 from the Lambda security group only

## Errors Encountered

### 1. `AccessDenied: rds:CreateDBInstance`

- **Cause:** Deployer IAM role had no RDS permissions
- **Fix:** Added RDS permission block to IAM module

### 2. `Unable to create service linked role`

- **Cause:** First RDS instance in the account requires `iam:CreateServiceLinkedRole` permission
- **Fix:** Added `iam:CreateServiceLinkedRole` scoped to `rds.amazonaws.com`

### 3. Secrets `already scheduled for deletion`

- **Cause:** Previous `terraform destroy` on PR env deleted secrets, but AWS holds them in a 7-30 day recovery window, blocking re-creation
- **Fix:** Force-deleted secrets via CLI (`aws secretsmanager delete-secret --force-delete-without-recovery`), then made `recovery_window_in_days` a configurable variable (defaults to `30`, dev passes `0`)

### 4. `Cannot find version 16.1 for postgres`

- **Cause:** AWS deprecated PostgreSQL 16.1
- **Fix:** Updated `engine_version` to `16.6`

### 5. IAM role `EntityAlreadyExists` on `terraform apply`

- **Cause:** Role existed in AWS but not in local Terraform state (different workspace)
- **Fix:** Imported the role and policy into state, then applied:
  ```bash
  terraform import 'module.iam_cicd.aws_iam_role.github_actions_deployer[0]' ustc-payment-processor-dev-cicd-deployer-role
  terraform import 'module.iam_cicd.aws_iam_role_policy.github_actions_permissions[0]' 'ustc-payment-processor-dev-cicd-deployer-role:ustc-payment-portal-dev-ci-deployer'
  terraform apply -target=module.iam_cicd -auto-approve
  ```

### 6. `AccessDenied: rds:CreateDBParameterGroup`

- **Cause:** Deployer IAM role had RDS instance permissions but was missing parameter group permissions (`CreateDBParameterGroup`, `DeleteDBParameterGroup`, `ModifyDBParameterGroup`). This surfaced because the RDS module creates an `aws_db_parameter_group` resource for PostgreSQL logging configuration.
- **Root cause:** The deployer role is managed by the same Terraform workspace it deploys (chicken-and-egg problem). New IAM permissions added in a branch aren't available until the dev workspace is applied.
- **Fix:** Added parameter group permissions to the IAM module and applied the dev workspace to update the deployer role policy.
- **Future mitigation:** Consider moving the deployer role to the foundation layer, which is applied independently with admin credentials before CI/CD runs.

## Files Modified

| File | Change |
| --- | --- |
| `terraform/modules/rds/main.tf` | Updated engine version to 16.6, added CloudWatch logging and parameter group |
| `terraform/modules/rds/variables.tf` | RDS module input variables |
| `terraform/modules/rds/outputs.tf` | Exports `endpoint` and `port` |
| `terraform/modules/iam/main.tf` | Added RDS + parameter group + service-linked role permissions |
| `terraform/modules/secrets/main.tf` | Replaced hardcoded `recovery_window_in_days` with `var.recovery_window_in_days` |
| `terraform/modules/secrets/variables.tf` | Added `recovery_window_in_days` variable with validation (0 or 7-30, default 30) |
| `terraform/modules/networking/main.tf` | Added second private subnet, DB subnet group, and RDS security group |
| `terraform/modules/networking/variables.tf` | Added `private_subnet_cidr_2` and `availability_zone_2` |
| `terraform/modules/networking/outputs.tf` | Added `db_subnet_group_name` and `rds_security_group_id` |
| `terraform/environments/dev/main.tf` | Added `module "rds"`, password generation, secret version |
| `terraform/environments/dev/locals.tf` | Added `RDS_ENDPOINT` to Lambda env |
| `terraform/environments/dev/outputs.tf` | Added `rds_endpoint` output |
| `terraform/environments/dev/secrets-module.tf` | Added `recovery_window_in_days = 0` |
| `terraform/environments/stg/main.tf` | Added `module "rds"`, password generation, secret version |
| `terraform/environments/stg/locals.tf` | Added `RDS_ENDPOINT` to Lambda env |
| `terraform/environments/stg/outputs.tf` | Added `rds_endpoint` output |
| `terraform/environments/stg/secrets-module.tf` | Added `recovery_window_in_days = 30` |
| `terraform/environments/prod/main.tf` | Added `module "rds"` with prod hardening flags |
| `terraform/environments/prod/locals.tf` | Added `RDS_ENDPOINT` + `TCS_APP_ID` |
| `terraform/environments/prod/outputs.tf` | Added `rds_endpoint` output |
| `terraform/environments/prod/secrets-module.tf` | Added `recovery_window_in_days = 30` |
| `terraform/environments/foundation/*/main.tf` | Added second private subnet and second AZ for DB subnet group |
| `terraform/environments/foundation/*/outputs.tf` | Added `db_subnet_group_name`, `rds_security_group_id`, and missing descriptions |
