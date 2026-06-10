# Foundation (Networking) Stack

This directory is the shared Terraform root for the foundation layer (networking + base IAM) across `dev`, `stg`, and `prod`.

Environment-specific configuration is split into:

- `backend/{dev,stg,prod}.hcl` for backend state key/bucket
- `vars/{dev,stg,prod}.vars.hcl` for Terraform variables

## Why keep foundation separate from app state?

- Blast radius reduction for VPC/networking resources
- Smaller/faster app plans and applies
- Safer operational boundaries when rolling back workloads

## State layout

Foundation state keys remain environment-specific:

- `ustc-payment-portal/dev/networking.tfstate`
- `ustc-payment-portal/stg/networking.tfstate`
- `ustc-payment-portal/prod/networking.tfstate`

## Local execution (recommended)

Use package scripts with explicit environment selection:

```bash
npm run tf:foundation:init -- --env=dev
npm run tf:foundation:plan -- --env=stg
npm run tf:foundation:apply -- --env=prod
```

Manual alternative (when not using npm scripts):

```bash
# From repository root
cd terraform/environments/foundation

# Pick one environment profile before running Terraform
export AWS_PROFILE=ustcpp-dev
export AWS_SDK_LOAD_CONFIG=1

terraform init -input=false -backend-config=backend/dev.hcl -reconfigure
terraform plan -input=false -var-file=vars/dev.vars.hcl
terraform apply -input=false -var-file=vars/dev.vars.hcl
```

Replace `dev` with `stg` or `prod` as needed. In this shared root, always use `backend/<env>.hcl` and `vars/<env>.vars.hcl` (not a generic `backend.hcl`).

The script enforces standardized local profile names:

- `ustcpp-dev`
- `ustcpp-stg`
- `ustcpp-prod`

It also:

1. Verifies caller identity via `aws sts get-caller-identity`
2. Triggers `aws sso login --profile <profile>` if the session is expired
3. Runs Terraform with the matching backend/tfvars for the selected environment

## What this layer creates

- VPC, subnets, internet gateway, NAT, route tables
- Lambda and RDS security groups
- Base IAM roles used by workload deployment
- Dev-only shared artifacts bucket policy attachment (via `vars/dev.vars.hcl`)
