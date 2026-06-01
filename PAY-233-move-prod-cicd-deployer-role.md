# PAY-233: Move Prod CI/CD Deployer Role to Foundation

## Objective

Move ownership of the production GitHub Actions CI/CD deployer role (and OIDC provider dependency) from the prod application stack into foundation, so the pipeline can assume the role before the first prod app deploy and avoid bootstrap deadlocks.

## Background

Today, the prod app stack manages CI/CD IAM in `terraform/environments/prod/main.tf` via `module "iam_cicd"`, and `terraform/environments/prod/locals.tf` hardcodes `github_oidc_provider_arn`.

This creates a circular dependency:

- CI needs the role to run Terraform.
- Terraform for prod currently manages that same role and related trust config.

It also adds unnecessary IAM/OIDC noise to normal app plans and increases blast radius for app-only changes.

## Acceptance Criteria Mapping

- Remove `module "iam_cicd"` from prod app stack.
- Remove hardcoded `github_oidc_provider_arn` from prod locals.
- Source OIDC/deployer values through `data.terraform_remote_state.foundation`.
- Ensure CI/CD deployer role is created and owned under foundation.

## Scope

### In Scope

- Terraform root changes in:
  - `terraform/environments/foundation/prod-networking/`
  - `terraform/environments/prod/`
- Foundation outputs for deployer role/OIDC values.
- Prod root rewiring to consume foundation outputs.
- Migration notes for state handoff.

### Out of Scope

- Workflow logic changes in GitHub Actions beyond validating existing role assumption still works.
- Renaming the deployer role ARN used by existing secrets.
- Broad IAM permission redesign unrelated to ownership move.

## Implementation Plan

### 1) Prepare Foundation as Source of Truth for Prod IAM Bootstrap

1. Add/extend IAM usage in `terraform/environments/foundation/prod-networking/main.tf`.
2. Configure deployer role creation for prod in foundation (currently dev/stg use `create_deployer_role = false`; prod should enable it).
3. Keep deploy role name stable to preserve current ARN and avoid CI interruption.
4. Provide required module inputs:
   - `environment = "prod"`
   - `deploy_role_name` (current production name)
   - `github_org`, `github_repo`
   - state bucket and key patterns
   - lambda execution role ARN input as needed by module
5. Handle OIDC provider in foundation:
   - Preferred for low-risk migration: reference existing provider (data-driven) and output ARN.
   - Optional later enhancement: have foundation manage provider lifecycle explicitly.

### 2) Publish Foundation Outputs Needed by Prod App Stack

1. Update `terraform/environments/foundation/prod-networking/outputs.tf` to export:
   - CI/CD deployer role ARN
   - CI/CD deployer role name
   - GitHub OIDC provider ARN
   - Lambda execution role ARN (if prod app should no longer depend on prod IAM module for this)
2. Keep output names explicit and environment-agnostic where practical.

### 3) Decouple Prod App Root from IAM/OIDC Management

1. Remove `module "iam_cicd"` block from `terraform/environments/prod/main.tf`.
2. Replace any references to `module.iam_cicd.*` with `data.terraform_remote_state.foundation.outputs.*`.
   - Example: Lambda execution role input should come from foundation output.
3. Remove IAM-specific `depends_on` references tied to `module.iam_cicd` where no longer needed.
4. Keep prod root focused on workloads (Lambda, API Gateway, RDS, secrets, routing/cert resources).

### 4) Remove Hardcoded OIDC Local in Prod

1. Delete `github_oidc_provider_arn` from `terraform/environments/prod/locals.tf`.
2. Ensure prod no longer hardcodes provider ARN and instead relies on foundation output consumption.
3. Remove any now-unused locals to keep root clean.

### 5) Update Prod Outputs to Avoid Broken References

1. Update `terraform/environments/prod/outputs.tf`:
   - Remove or replace outputs currently pointing at `module.iam_cicd`.
   - If `cicd_role_arn` is still desired for consumers, re-export from foundation remote state.

### 6) Execute Safe Migration Sequence (Avoid IAM Disruption)

1. Apply foundation changes first in prod foundation root.
2. Import existing IAM resources into foundation state before first foundation apply if resources already exist and are currently tracked elsewhere.
3. Verify foundation plan is additive/adoptive and does not replace active deployer role.
4. After foundation successfully owns resources, apply prod app root changes removing IAM module.
5. Verify prod app plan no longer includes deployer role/OIDC churn.

### 7) Validate CI and Runtime Behavior

1. Confirm GitHub prod workflow still assumes role via existing secret value (`PROD_AWS_DEPLOYER_ROLE_ARN`).
2. Run Terraform plan in prod app root and verify:
   - no `iam_cicd` module resources in plan
   - app resource changes remain unaffected
3. Run Terraform plan in foundation prod root and verify IAM/OIDC ownership there.
4. Confirm emergency IAM fixes can be applied via foundation path without relying on app pipeline bootstrap.

## Suggested Task Breakdown

- Task A: Foundation prod root IAM/OIDC ownership + outputs.
- Task B: Prod root cleanup and remote-state rewiring.
- Task C: Migration/import runbook and validation evidence.

## Risks and Mitigations

- Risk: Role replacement breaks CI assumptions.
  - Mitigation: Preserve exact role name and trust settings; import existing role into foundation state before apply.
- Risk: Missing outputs break prod root references.
  - Mitigation: Add outputs first, plan foundation, then change prod references.
- Risk: Hidden dependencies on prod `module.iam_cicd`.
  - Mitigation: grep/search all `module.iam_cicd` usages and clear them before merge.

## Definition of Done

- `terraform/environments/prod/main.tf` has no `module "iam_cicd"`.
- `terraform/environments/prod/locals.tf` does not hardcode `github_oidc_provider_arn`.
- Prod consumes IAM/OIDC values through `data.terraform_remote_state.foundation.outputs`.
- Foundation prod root creates/owns CI/CD deployer role (and OIDC dependency source).
- CI can assume deployer role before prod app Terraform operations.

## Copy/Paste Code Changes by File

Use the snippets below as implementation-ready changes. The blocks are written against the current code in this branch.

### 1) `terraform/environments/foundation/prod-networking/main.tf`

Add these blocks after the provider (before/after `module "networking"` is fine):

```hcl
data "aws_caller_identity" "current" {}

data "aws_iam_openid_connect_provider" "github" {
   url = "https://token.actions.githubusercontent.com"
}
```

Add this module block after `module "networking"`:

```hcl
module "iam" {
   source = "../../../modules/iam"

   aws_region               = "us-east-1"
   environment              = "prod"
   name_prefix              = "ustc-payment-portal-prod"
   deploy_role_name         = "ustc-payment-processor-prod-cicd-deployer-role"
   github_oidc_provider_arn = data.aws_iam_openid_connect_provider.github.arn
   github_org               = "ustaxcourt"
   github_repo              = "ustc-payment-portal"
   state_bucket_name        = "ustc-payment-portal-terraform-state-prod"
   state_object_keys        = ["ustc-payment-portal/prod/*"]
   lambda_exec_role_arn     = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/ustc-payment-portal-prod-lambda-exec"
   lambda_name_prefix       = "ustc-payment-portal-prod"
   create_lambda_exec_role  = true
   create_deployer_role     = true

   tags = {
      Env     = "prod"
      Project = "ustc-payment-portal"
   }
}
```

### 2) `terraform/environments/foundation/prod-networking/outputs.tf`

Add these outputs to the end of the file:

```hcl
output "github_oidc_provider_arn" {
   value       = data.aws_iam_openid_connect_provider.github.arn
   description = "GitHub Actions OIDC provider ARN"
}

output "cicd_role_arn" {
   value       = module.iam.role_arn
   description = "ARN of the GitHub OIDC CI/CD deployer role"
}

output "cicd_role_name" {
   value       = module.iam.role_name
   description = "Name of the GitHub OIDC CI/CD deployer role"
}

output "lambda_role_arn" {
   value       = module.iam.lambda_role_arn
   description = "ARN of Lambda execution role"
}
```

### 3) `terraform/environments/prod/main.tf`

Replace this line inside `module "lambda"`:

```hcl
lambda_execution_role_arn = module.iam_cicd.lambda_role_arn
```

with:

```hcl
lambda_execution_role_arn = data.terraform_remote_state.foundation.outputs.lambda_role_arn
```

Remove this block entirely:

```hcl
data "aws_caller_identity" "current" {}
```

In both resources below, remove the `depends_on = [module.iam_cicd]` line:

- `resource "aws_route53_zone" "this"`
- `resource "aws_acm_certificate" "this"`

Remove this module block entirely:

```hcl
module "iam_cicd" {
   source = "../../modules/iam"

   aws_region               = local.aws_region
   environment              = local.environment
   name_prefix              = local.name_prefix
   deploy_role_name         = "ustc-payment-processor-prod-cicd-deployer-role"
   github_oidc_provider_arn = local.github_oidc_provider_arn
   github_org               = local.github_org
   github_repo              = local.github_repo
   state_bucket_name        = local.state_bucket_name
   state_object_keys        = local.state_object_keys
   lambda_exec_role_arn     = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${local.name_prefix}-lambda-exec"
   lambda_name_prefix      = local.name_prefix
   create_lambda_exec_role = true
}
```

### 4) `terraform/environments/prod/locals.tf`

Remove these locals (they are no longer needed once IAM moves to foundation):

```hcl
github_oidc_provider_arn = "arn:aws:iam::802939326821:oidc-provider/token.actions.githubusercontent.com"
github_org               = "ustaxcourt"
github_repo              = "ustc-payment-portal"
state_bucket_name        = "ustc-payment-portal-terraform-state-prod"
state_object_keys = [
   "ustc-payment-portal/prod/*"
]
```

### 5) `terraform/environments/prod/outputs.tf`

Replace this output:

```hcl
output "cicd_role_arn" {
   value       = module.iam_cicd.role_arn
   description = "ARN of the GitHub OIDC CI/CD deployer role"
}
```

with:

```hcl
output "cicd_role_arn" {
   value       = data.terraform_remote_state.foundation.outputs.cicd_role_arn
   description = "ARN of the GitHub OIDC CI/CD deployer role"
}
```

## Apply Order (Important)

1. Apply foundation prod networking stack changes first.
2. Validate foundation outputs include `cicd_role_arn`, `github_oidc_provider_arn`, and `lambda_role_arn`.
3. Apply prod app stack changes removing `module "iam_cicd"`.
4. Validate prod plan no longer includes IAM/OIDC ownership churn.

## Notes for State Handoff

- If the deployer role already exists and is currently tracked in prod app state, move/import state ownership before final apply to prevent replacement.
- Keep deploy role name unchanged (`ustc-payment-processor-prod-cicd-deployer-role`) to preserve existing GitHub secret compatibility.
