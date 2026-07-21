# Dependency Management

This repository contains both npm and Terraform dependencies.

Dependency reviews and updates are intentionally split into two scripts:

- `bin/review-dependencies.sh`
- `bin/update-dependencies.sh`

The review script is read-only and generates reports.

The update script refreshes Terraform provider selections and updates Terraform lock files (`.terraform.lock.hcl`) without connecting to remote backends.

---

## Prerequisites

Ensure the following tools are installed:

- Node.js
- npm
- Terraform
- ripgrep (`rg`)
- AWS CLI

Confirm the AWS CLI is configured:

```bash
aws sts get-caller-identity
```

---

## npm Scripts

Dependency management can be run through npm scripts:

Review dependencies:

```bash
npm run deps:review
```

Update non-production Terraform provider locks:

```bash
npm run deps:update
```

Update Terraform provider locks, including production roots:

```bash
npm run deps:update:prod
```

Equivalent command:

```bash
INCLUDE_PROD=true ./bin/update-dependencies.sh
```

---

# Review Dependencies

Run:

```bash
./bin/review-dependencies.sh
```

or:

```bash
npm run deps:review
```

This script does not modify any files.

## What It Checks

### npm Direct Dependency Updates

Shows packages with newer versions available:

```bash
npm outdated
```

Machine-readable output:

```bash
npm outdated --json
```

### npm Major Version Updates

Shows available upgrades, including major version changes:

```bash
npx npm-check-updates
```

Preview updates against the latest published versions:

```bash
npx npm-check-updates --target latest
```

### npm Vulnerabilities

Checks dependency vulnerabilities:

```bash
npm audit
```

Production-only vulnerabilities:

```bash
npm audit --omit=dev
```

### Terraform Configuration

Reviews Terraform version constraints and provider declarations:

```hcl
required_version
required_providers
```

for the following Terraform roots:

```text
terraform/environments/dev
terraform/environments/stg
terraform/environments/prod
terraform/environments/foundation/dev-networking
terraform/environments/foundation/stg-networking
terraform/environments/foundation/prod-networking
```

### Terraform Lock Files

Reports whether each Terraform root contains:

```text
.terraform.lock.hcl
```

### AWS Identity

Displays the currently authenticated AWS identity:

```bash
aws sts get-caller-identity
```

This helps confirm which AWS account and role are being used.

### GitHub Actions

Lists GitHub Actions versions referenced in workflow definitions:

```bash
rg "uses:" .github/workflows
```

### Docker Images

Lists Docker image references:

```bash
rg "FROM |image:" .
```

### Node Runtime Configuration

Lists files that may pin Node versions:

```text
.nvmrc
package.json
Dockerfile
```

---

# Update Terraform Provider Dependencies

Run:

```bash
./bin/update-dependencies.sh
```

or:

```bash
npm run deps:update
```

By default, production Terraform roots are skipped.

## What It Does

For each non-production Terraform root:

```bash
terraform init -upgrade -backend=false
```

This updates provider selections and refreshes:

```text
.terraform.lock.hcl
```

without connecting to the configured remote backend.

This allows provider updates to be reviewed without requiring access to Terraform state buckets.

---

## Production Roots

The following Terraform roots are considered production:

```text
terraform/environments/prod
terraform/environments/foundation/prod-networking
```

These are skipped by default.

Example:

```bash
./bin/update-dependencies.sh
```

Output:

```text
Skipping prod root: terraform/environments/prod
Skipping prod root: terraform/environments/foundation/prod-networking
```

To include production roots:

```bash
INCLUDE_PROD=true ./bin/update-dependencies.sh
```

or:

```bash
npm run deps:update:prod
```

This updates provider lock files for all configured Terraform roots, including production environments.

---

## Review Changes

After running updates, review Terraform lock file changes:

```bash
git diff -- '*.lock.hcl'
```

Review all modified files:

```bash
git status
```

---

## Recommended Workflow

Create a branch:

```bash
git checkout -b chore/dependency-updates
```

Review dependency status:

```bash
npm run deps:review
```

Update Terraform providers:

```bash
npm run deps:update
```

Review lock file changes:

```bash
git diff -- '*.lock.hcl'
```

Validate Terraform:

```bash
terraform validate
```

Run application checks:

```bash
npm run lint
npm run test
npm run build
```

Commit changes:

```bash
git add .
git commit -m "chore: update terraform providers"
```

Open a pull request for review.

---

## Notes

### Terraform Version Alignment

All Terraform roots should ideally use the same Terraform version constraint, for example:

```hcl
required_version = "~> 1.15.0"
```

The review script can be used to identify version drift between environments.

### AWS Permissions

Some Terraform environments require elevated AWS permissions to access remote state.

Because updates use:

```bash
terraform init -upgrade -backend=false
```

the update script does not require S3 backend access and can safely refresh provider selections without connecting to remote state backends.

### npm Dependency Updates

The current update script only updates Terraform provider lock files.

npm package upgrades should be reviewed separately using:

```bash
npm outdated
npx npm-check-updates
npm audit
```

before updating package versions or lock files.
