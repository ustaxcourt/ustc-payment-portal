# PAY-049: Database Provisioning

## Summary

Provisioned a PostgreSQL 16.6 RDS instance across all environments (dev, stg, prod) via Terraform, with per-environment configuration and CI/CD pipeline support.

## What Was Done

### RDS Module (`terraform/modules/rds/`)
- Already existed with configurable `multi_az`, `deletion_protection`, and `skip_final_snapshot`
- Updated `engine_version` from `16.1` to `16.6` (AWS deprecated 16.1)

### IAM Permissions (`terraform/modules/iam/main.tf`)
- Added RDS permissions: `CreateDBInstance`, `DeleteDBInstance`, `ModifyDBInstance`, `DescribeDBInstances`, `DescribeDBSubnetGroups`, `ListTagsForResource`, `AddTagsToResource`, `RemoveTagsFromResource`, `CreateDBSnapshot`, `DeleteDBSnapshot`, `DescribeDBSnapshots`
- Added `iam:CreateServiceLinkedRole` for `rds.amazonaws.com` (required for first RDS instance in an account)

### Environment Wiring
- **Dev** (`terraform/environments/dev/main.tf`): `module "rds"` with `multi_az = false`
- **Stg** (`terraform/environments/stg/main.tf`): `module "rds"` with `multi_az = false`
- **Prod** (`terraform/environments/prod/main.tf`): `module "rds"` with `multi_az = true`, `deletion_protection = true`, `skip_final_snapshot = false`
- All environments generate a `random_password` and store credentials in Secrets Manager via `aws_secretsmanager_secret_version`
- Added `RDS_ENDPOINT` to Lambda environment variables and `rds_endpoint` to Terraform outputs in all environments

### Secrets Manager Recovery Fix (`terraform/modules/secrets/main.tf`)
- Set `recovery_window_in_days = 0` on all secrets so PR environment secrets are deleted immediately on `terraform destroy`, preventing re-creation conflicts when the pipeline runs again

## Errors Encountered

### 1. `AccessDenied: rds:CreateDBInstance`
- **Cause:** Deployer IAM role had no RDS permissions
- **Fix:** Added RDS permission block to IAM module

### 2. `Unable to create service linked role`
- **Cause:** First RDS instance requires `iam:CreateServiceLinkedRole` permission
- **Fix:** Added `iam:CreateServiceLinkedRole` scoped to `rds.amazonaws.com`

### 3. Secrets `already scheduled for deletion`
- **Cause:** Previous `terraform destroy` on PR env deleted secrets, but AWS holds them in a 7-30 day recovery window, blocking re-creation
- **Fix:** Force-deleted secrets via CLI (`aws secretsmanager delete-secret --force-delete-without-recovery`), then set `recovery_window_in_days = 0` on all secrets to prevent recurrence

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

## Files Modified

| File | Change |
|------|--------|
| `terraform/modules/rds/main.tf` | Updated engine version to 16.6 |
| `terraform/modules/iam/main.tf` | Added RDS + service-linked role permissions |
| `terraform/modules/secrets/main.tf` | Set `recovery_window_in_days = 0` for immediate deletion |
| `terraform/environments/dev/locals.tf` | Added `RDS_ENDPOINT` to Lambda env |
| `terraform/environments/dev/outputs.tf` | Added `rds_endpoint` output |
| `terraform/environments/stg/main.tf` | Added `module "rds"`, password, secret version |
| `terraform/environments/stg/locals.tf` | Added `RDS_ENDPOINT` to Lambda env |
| `terraform/environments/stg/outputs.tf` | Added `rds_endpoint` output |
| `terraform/environments/prod/main.tf` | Added `module "rds"` with prod hardening flags |
| `terraform/environments/prod/locals.tf` | Added `RDS_ENDPOINT` + missing `TCS_APP_ID` |
| `terraform/environments/prod/outputs.tf` | Added `rds_endpoint` output |
