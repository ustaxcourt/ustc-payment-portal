# Foundation (Networking) Stack

This directory contains the environment-specific roots for the "foundation" layer: primarily VPC networking (VPC, subnets, IGW, NAT, route tables, and security groups). Each environment keeps networking in a separate Terraform state key from the application/workloads.

## Why a separate foundation directory and state key?

- **Blast radius reduction**
  Networking changes are rare but risky. Keeping VPC/NAT/Routes in their own state means day-to-day app/API changes won’t touch critical networking state.

- **Faster plans and applies**
  App (Lambdas/API Gateway) iterates frequently. Separating state keeps those plans small and fast.

- **Safer rollbacks**
  App rollbacks (workloads) don’t affect VPC. Conversely, networking maintenance doesn’t disturb app state.

## State layout (per environment)

- Bucket (dev): `ustc-payment-portal-terraform-state-dev`
- Key (foundation/networking): `ustc-payment-portal/dev/networking.tfstate`
- Lock table: `ustc-payment-portal-terraform-locks-dev`

You will use analogous buckets/keys for `stg` and `prod`.

## Directory structure here

- `foundation/dev-networking/`
  - `backend.hcl` — points to the dev networking state key
  - `main.tf` — composes the networking module with explicit values for dev
  - `outputs.tf` — re-exports module outputs for easy consumption by CI or other stacks

> The reusable module code lives at `terraform/modules/networking/`.

## Using foundation/dev-networking (dev)

Prerequisites:
- Terraform initialized with the backend bootstrap (S3 bucket + DynamoDB table created)
- Authenticated to the dev AWS account (e.g., SSO profile)

Steps:

```bash
# Authenticate (example with AWS SSO)
aws sso login --profile ent-apps-payment-portal-workloads-dev
export AWS_PROFILE=ent-apps-payment-portal-workloads-dev

# Navigate to the dev networking root
cd terraform/environments/foundation/dev-networking

# Initialize the backend (uses backend.hcl)
terraform init -backend-config=backend.hcl -reconfigure 

## What this creates (dev)

- VPC with CIDR `10.20.0.0/25`
- Subnets: public `10.20.0.0/28`, private `10.20.0.32/28` (in `us-east-1a`)
- Internet Gateway, EIP, NAT Gateway (in the public subnet)
- Route Tables: public route to IGW; private route to NAT
- Lambda Security Group (permissive for parity; harden later)

## IAM Module
 This is needed to grant Lambda permissions to create CloudWatch logs and Permissions to manage ENIs in VPCs Lambdas in VPC will need these permissions. This was auto-created in serverless framework, but we have to configure it in terraform.

These will beused later by the workloads stack (Lambdas/API).

