# How to Update Dependencies

This repository contains both npm and Terraform dependencies. Dependency reviews and updates are intentionally split into two scripts:

- `bin/review-dependencies.sh`
- `bin/update-dependencies.sh`

The review script is read-only and generates reports. The update script updates Terraform provider lock files.

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

# Review Dependencies

Run:

```bash
./bin/review-dependencies.sh
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

```bash
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

Lists GitHub Actions versions in workflow definitions:

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

This is useful because provider updates can be reviewed without requiring access
