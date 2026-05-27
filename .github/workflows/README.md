# CI/CD Workflows (Dev Overview, staging and prod will be added later)

## Overview
- **Purpose**: Automate build, test, and deploy to environments
- **Auth**: Uses GitHub OIDC to assume AWS roles; no long‑lived AWS keys.

## Workflows
- **PR Build/Test & Ephemeral Deploy** (`pr_build_test_deploy`)
  - Trigger: Pull Request opened/synchronized.
  - Creates an ephemeral AWS workspace `pr-<number>`.
  - Runs integration tests against the PR API (`BASE_URL` from Terraform outputs).
  - Publishes test results and coverage as artifacts.

- **PR Cleanup** (`pr_cleanup`)
  - Trigger: Pull Request closed.
  - Builds lambda bundles, runs `terraform plan -destroy`, then `terraform destroy`.
  - Deletes the `pr-<number>` workspace only if destroy succeeds.

- **Deploy to Dev** (`deploy_dev`)
  - Trigger: Push to `main`.
  - Builds the application and applies Terraform in the `dev` environment.
  - Keeps `dev` continuously up to date with `main`.

- **Deploy to Stg** (`staging-deploy.yml`)
  - Trigger: Manual from GitHub Actions
  - Finds dev tag to deploy, validates that sha for that tag exists, creates RC tag, then copies build artifact from dev artifact bucket to staging and deploys any infrastructure updates
  - If no dev tag is specified on workflow trigger, will automatically find the latest dev tag to use for promotion

- **Terraform Validate & Plan** (`terraform-plan.yml`)
  - Trigger: Pull Request opened/synchronized/reopened.
  - Runs `terraform validate` and `terraform plan` against dev, stg, and prod in parallel (read-only).
  - Posts a unified plan summary as a single PR comment, updated in place across pushes; full plans uploaded as run artifacts (`tfplan-{env}`).
  - Does **not** apply — apply remains owned by `cicd-dev.yml`, `staging-deploy.yml`, and `prod-deploy.yml`.
  - **Known noise**: Lambda artifact diffs (`*_s3_key`, `*_source_code_hash`) in the plan output are placeholders for plan-only mode and should be ignored. Real Lambda changes ship via the deploy workflows.

## Notes
- **Ephemeral envs** are isolated per PR and destroyed on close.
- **Artifacts**: PR runs upload JUnit XML and coverage (lcov/HTML) for review.
- **Safety**: Cleanup does not delete workspaces if destroy fails, avoiding orphaned state.

## Release automation (RC tags)

The repository includes a GitHub Actions workflow `/.github/workflows/rc-release.yml` that documents each Release Candidate (RC) used for staging.

- **Trigger:** On push of a tag matching `v*.*.*-rc.*` (for example, `v2025.11.1-rc.5`).
- **What it does:** Automatically creates a GitHub Release page for the RC tag.
- **What it shows:** The RC tag, the exact commit SHA, and a link to the S3 artifacts prefix `s3://ustc-payment-portal-build-artifacts/artifacts/dev/<SHA>/` used by staging.
- **Why:** Provides a clear, immutable record of the precise commit and artifacts that were staged. When promoting to production, create the final tag (e.g., `vX.Y.Z`) on this same commit SHA so production deploys the identical artifacts.
