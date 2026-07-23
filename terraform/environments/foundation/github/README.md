# GitHub branch rulesets (main)

Terraform-managed protection for `main`: two rulesets — `main-tests` (no bypass;
requires a PR + the "Integration Gate" check) and `main-review` (1 review; admins
and Dependabot bypass). Rationale and policy matrix live in the PR that introduced
this.

## ⚠️ Apply order

The `integration_gate` job in `.github/workflows/cicd-dev.yml` must be on `main`
**before** you apply, or the rulesets require a check that never posts and block
every PR. Merge the workflow first, then apply.

## Prerequisites

- **GitHub admin credential**: a GitHub App (`GITHUB_APP_ID` / `GITHUB_APP_INSTALLATION_ID` / `GITHUB_APP_PEM_FILE`) or `GITHUB_TOKEN` (PAT) with repo `administration: write`.
- **AWS creds** for the dev account (Terraform state lives in the dev S3 backend).

## Apply

```bash
cd terraform/environments/foundation/github
terraform init -backend-config=backend.hcl -reconfigure
terraform plan
terraform apply
```

Optional cautious rollout — dry-run, watch **Settings → Rules → insights**, then enforce:

```bash
terraform apply -var="enforcement=evaluate"   # logs violations, blocks nothing
terraform apply                               # enforcement=active
```

## Rollback

```bash
terraform apply -var="enforcement=disabled"   # stop enforcing immediately
# or: terraform destroy
```
