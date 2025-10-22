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

## Notes
- **Ephemeral envs** are isolated per PR and destroyed on close.
- **Artifacts**: PR runs upload JUnit XML and coverage (lcov/HTML) for review.
- **Safety**: Cleanup does not delete workspaces if destroy fails, avoiding orphaned state.
