# GitHub branch ruleset (main) — integration-test gate

Terraform-managed `main-tests` ruleset. It adds the **required "Integration Gate"
check** to `main` (pinned to the GitHub Actions app), requires a PR, and blocks
force-push/deletion — with **no bypass**, so nobody, admins included, can merge with
failing integration tests.

The **review** requirement (1 approval) is enforced by the separate, hand-managed
**`merge to main`** ruleset. GitHub stacks rulesets, so the two combine: PR + review
(`merge to main`) + tests (`main-tests`). This root does not manage `merge to main`.

## ⚠️ Apply order

The `integration_gate` job in `.github/workflows/cicd-dev.yml` must be on `main`
**before** you enforce, or the ruleset requires a check that never posts and blocks
every PR. Merge the workflow first, then apply with `enforcement=active`.

## Prerequisites

- **GitHub admin credential**: a GitHub App (`GITHUB_APP_ID` / `GITHUB_APP_INSTALLATION_ID` / `GITHUB_APP_PEM_FILE`) or `GITHUB_TOKEN` (PAT) with repo `administration: write`.
- **AWS creds** for the dev account (Terraform state lives in the dev S3 backend).

## Apply

```bash
cd terraform/environments/foundation/github
terraform init -backend-config=backend.hcl -reconfigure
terraform plan
terraform apply -var="enforcement=evaluate"   # dry-run: logs violations, blocks nothing
terraform apply                               # enforcement=active (after the workflow is on main)
```

Watch would-be violations at **Settings → Rules → insights** before enforcing.

## Rollback

```bash
terraform apply -var="enforcement=disabled"   # stop enforcing immediately
# or: terraform destroy
```
