---
"@ustaxcourt/payment-portal": patch
---

PAY-264: Add a GitHub Actions workflow that runs `terraform validate` and `terraform plan` against dev, stg, and prod in parallel on every pull request, posting a unified summary comment so reviewers see infrastructure impact across all environments before merge.

- New `.github/workflows/terraform-plan.yml` — 3-env matrix (dev/stg/prod), OIDC-authenticated per env via the existing deployer role secrets (`DEV_AWS_DEPLOYER_ROLE_ARN`, `STAGING_AWS_DEPLOYER_ROLE_ARN`, `PROD_AWS_DEPLOYER_ROLE_ARN`).
- Per matrix leg: `terraform init` → `terraform validate` → `terraform plan -detailed-exitcode -out=tfplan`. Exit codes `0` (no changes) and `2` (changes pending) both count as success; only `1` (real error) fails the leg.
- Posts a single PR comment with a status table and collapsible plan output per env, updated in place across subsequent pushes (marker: `terraform-plan-bot:PAY-264`). Full plan output uploaded as artifacts named `tfplan-{env}` with 7-day retention.
- Read-only — never applies. Apply remains owned by `cicd-dev.yml` (dev), `staging-deploy.yml` (stg), and `prod-deploy.yml` (prod).
- Concurrency group per PR with `cancel-in-progress: true` so new pushes cancel stale runs.
- Passes the five `TF_VAR_*` placeholders that stg/prod's `variables.tf` declares without defaults; dev's defaults handle its leg, and dev-only Lambda variables aren't declared in stg/prod so they remain unset.
- Updated `.github/workflows/README.md` with the new workflow entry and a note about expected Lambda artifact diff noise in plan-only output.
- Added `docs/PAY-264-terraform-plan-workflow.md` covering design, OIDC trust-policy verification, secret prerequisites, and the recommended first-merge test sequence (throwaway PR, no-changes case, failure case).
