# Terraform for USTC Payment Portal

This directory contains Infrastructure as Code for the USTC Payment Portal. It is organized into layers with separate remote state keys per environment to enable safe, granular deployments.

## Terraform Version

This project requires **Terraform ~> 1.14.0**. The `~>` constraint means any 1.14.x version is supported, but 1.15+ is not until explicitly upgraded.

## State Locking

As of March 2026, this project uses **S3 native locking** (`use_lockfile = true`) instead of DynamoDB. This feature was introduced in Terraform 1.10 and provides state locking directly via S3 without requiring a separate DynamoDB table.

## Layout

- **`terraform/bootstrap/`**
  - Creates the S3 backend bucket used by Terraform remote state in each account.
  - **Note:** The DynamoDB lock tables are legacy and can be decommissioned (see [DynamoDB Cleanup](#dynamodb-cleanup-legacy) below).
- **`terraform/environments/foundation/`**
  - Environment networking and base IAM (per environment/account).
  - `dev-networking/`, `stg-networking/`: VPC, subnets, security groups, IAM base.
- **`terraform/environments/dev/`**, **`terraform/environments/stg/`**, **`terraform/environments/prod/`**
  - Application stack (Lambda, API Gateway, CI/CD IAM, etc.).
  - Uses `data.terraform_remote_state` to read the foundation outputs.
- **`terraform/modules/`**
  - Reusable modules such as `api-gateway/`, `iam/`, `lambda/`, `networking/`.
- **`terraform/scripts/`**
  - Helper scripts, e.g., `build-lambda.sh` bundles Lambda code before apply.

## Remote State Design (two keys per environment)

Each environment uses two distinct S3 object keys for Terraform state stored in that environment's backend bucket. This separation allows:

- **[foundation]** Networking/IAM to be applied independently and infrequently.
- **[app]** Application/API to be iterated and deployed frequently without risking foundation resources.

From `terraform/environments/dev/locals.tf` and `terraform/environments/stg/locals.tf`:

- **Dev** bucket: `ustc-payment-portal-terraform-state-dev`
  - Foundation state key: `ustc-payment-portal/dev/networking.tfstate`
  - App state key: `ustc-payment-portal/dev/dev.tfstate`
- **Stg** bucket: `ustc-payment-portal-terraform-state-stg`
  - Foundation state key: `ustc-payment-portal/stg/networking.tfstate`
  - App state key: `ustc-payment-portal/stg/stg.tfstate`

Locking is handled with S3 native locking via `use_lockfile = true` in the backend configuration. This creates `.tflock` files in S3 alongside the state files.

The app layer reads the foundation outputs via `data "terraform_remote_state" "foundation"` with the foundation state key. See:

- `terraform/environments/dev/main.tf`
- `terraform/environments/stg/main.tf`

## One-time Bootstrap (per account)

Run in the target AWS account to create the backend bucket for that account/environment. The provider region is defined in the module; confirm desired region.

```bash
cd terraform/bootstrap

# Initialize local state for bootstrap itself (local state is fine here)
terraform init

# Review
terraform plan \
  -var "aws_region=us-east-1" \
  -var "state_bucket_name=ustc-payment-portal-terraform-state-<env>"

# Apply
terraform apply \
  -var "aws_region=us-east-1" \
  -var "state_bucket_name=ustc-payment-portal-terraform-state-<env>"
```

Replace `<env>` with `dev`, `stg`, or `prod` depending on the target account.

## Foundation (networking) layer

Initialize with the environment-specific backend. This writes/reads `networking.tfstate` in the environment bucket.

- Dev foundation (`terraform/environments/foundation/dev-networking/`):

```bash
cd terraform/environments/foundation/dev-networking

terraform init \
  -backend-config="bucket=ustc-payment-portal-terraform-state-dev" \
  -backend-config="key=ustc-payment-portal/dev/networking.tfstate" \
  -backend-config="region=us-east-1" \
  -backend-config="use_lockfile=true" \
  -backend-config="encrypt=true"

terraform plan
terraform apply
```

- Stg foundation (`terraform/environments/foundation/stg-networking/`):

```bash
cd terraform/environments/foundation/stg-networking

terraform init \
  -backend-config="bucket=ustc-payment-portal-terraform-state-stg" \
  -backend-config="key=ustc-payment-portal/stg/networking.tfstate" \
  -backend-config="region=us-east-1" \
  -backend-config="use_lockfile=true" \
  -backend-config="encrypt=true"

terraform plan
terraform apply
```

## Application (Lambda, API Gateway, CI IAM) layer

Initialize with the environment-specific backend for the app state key. The app layer imports outputs from the foundation layer via `data.terraform_remote_state`.

- Dev app (`terraform/environments/dev/`):

```bash
cd terraform/environments/dev

# Backend for dev app state
terraform init \
  -backend-config="bucket=ustc-payment-portal-terraform-state-dev" \
  -backend-config="key=ustc-payment-portal/dev/dev.tfstate" \
  -backend-config="region=us-east-1" \
  -backend-config="use_lockfile=true" \
  -backend-config="encrypt=true"

# Optional: build/bundle Lambda code prior to plan/apply
( cd ../../scripts && ./build-lambda.sh )

terraform plan
terraform apply
```

- Stg app (`terraform/environments/stg/`):

```bash
cd terraform/environments/stg

# Backend for stg app state
terraform init \
  -backend-config="bucket=ustc-payment-portal-terraform-state-stg" \
  -backend-config="key=ustc-payment-portal/stg/stg.tfstate" \
  -backend-config="region=us-east-1" \
  -backend-config="use_lockfile=true" \
  -backend-config="encrypt=true"

# Optional: build/bundle Lambda code prior to plan/apply
( cd ../../scripts && ./build-lambda.sh )

terraform plan
terraform apply
```

> Note: `terraform/environments/prod/` also declares an S3 backend; mirror the same pattern with the prod bucket/table/keys when that environment is ready.

## AWS Authentication from Terminal (SSO)

Use AWS SSO to authenticate prior to running Terraform. Example flow using your commands:

```bash
# 1) List SSO profiles from your AWS config
aws configure list-profiles

# 2) Start SSO login for the chosen profile
aws sso login --profile <profile-name>

# 3) Export default profile for the shell
export AWS_PROFILE=<profile-name>

# 4) Verify caller identity (optional)
aws sts get-caller-identity --profile <profile-name>
```

Terraform then uses the exported `AWS_PROFILE` automatically. Alternatively, you can set `AWS_SDK_LOAD_CONFIG=1` to ensure shared config is loaded.

```bash
export AWS_PROFILE=<profile-name>
export AWS_SDK_LOAD_CONFIG=1
```

## Notes & Tips

- **Two state keys per environment**: keep foundation and app isolated to reduce blast radius and allow parallel workflows.
- **S3 Native Locking**: Terraform 1.14+ uses `use_lockfile=true` for state locking via S3. No DynamoDB table required.
- **Drift/plan checks**: Prefer `terraform plan` in CI with explicit backend config and upload a plan artifact for review.
- **State permissions**: IAM for CI (`modules/iam`) is scoped to specific state object keys (see `state_object_keys` in `locals.tf`). Ensure keys match your environment naming.
- **Local development**: After pulling this upgrade, run `terraform init -reconfigure -backend-config=backend.hcl` in each environment directory to switch to S3 locking.

---

## DynamoDB Cleanup (Legacy)

The following DynamoDB tables were previously used for state locking but are no longer needed after migrating to S3 native locking:

| Table Name                                 | Environment |
| ------------------------------------------ | ----------- |
| `ustc-payment-portal-terraform-locks-dev`  | Dev         |
| `ustc-payment-portal-terraform-locks-stg`  | Staging     |
| `ustc-payment-portal-terraform-locks-prod` | Production  |

### Cleanup Steps

**Prerequisites:** Ensure all CI/CD pipelines and local development workflows have successfully run with `use_lockfile=true` for at least 2 weeks before removing the tables.

1. **Verify no active locks** in the DynamoDB tables:

   ```bash
   aws dynamodb scan --table-name ustc-payment-portal-terraform-locks-dev --select COUNT
   ```

2. **Delete the tables** (after verification period):

   ```bash
   aws dynamodb delete-table --table-name ustc-payment-portal-terraform-locks-dev
   aws dynamodb delete-table --table-name ustc-payment-portal-terraform-locks-stg
   aws dynamodb delete-table --table-name ustc-payment-portal-terraform-locks-prod
   ```

3. **Update bootstrap module** to remove `lock_table_name` variable and DynamoDB resource if still present.

> **Note:** Keep the tables for a transition period to allow rollback if issues arise with S3 locking.
