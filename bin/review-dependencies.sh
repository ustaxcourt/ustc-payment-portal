#!/usr/bin/env bash

set -euo pipefail

# Known Terraform roots
TF_ROOTS=(
  "terraform/environments/dev"
  "terraform/environments/stg"
  "terraform/environments/prod"
  "terraform/environments/foundation/dev-networking"
  "terraform/environments/foundation/stg-networking"
  "terraform/environments/foundation/prod-networking"
)

echo "=== npm outdated ==="
npm outdated || true

echo
echo "=== npm outdated (json) ==="
npm outdated --json || true

echo
echo "=== npm-check-updates ==="
npx npm-check-updates || true

echo
echo "=== npm-check-updates (latest) ==="
npx npm-check-updates --target latest || true

echo
echo "=== npm audit ==="
npm audit || true

echo
echo "=== npm audit (production only) ==="
npm audit --omit=dev || true

echo
echo "=== Terraform version/provider pins ==="
rg "required_version|terraform_version|required_providers" \
  terraform .github/workflows || true

echo
echo "=== Terraform version constraints by root ==="

for dir in "${TF_ROOTS[@]}"; do
  [[ -d "$dir" ]] || continue

  echo
  echo "---- $dir ----"

  rg "required_version" "$dir" || echo "No required_version found"
done

echo
echo "=== Terraform roots discovered ==="

for dir in "${TF_ROOTS[@]}"; do
  [[ -d "$dir" ]] || continue

  echo "$dir"

  if [[ -f "$dir/.terraform.lock.hcl" ]]; then
    echo "  lock file: yes"
  else
    echo "  lock file: no"
  fi
done

echo
echo "=== Current AWS identity ==="

aws sts get-caller-identity || true

echo
echo "=== GitHub Actions versions ==="

rg "uses:" .github/workflows || true

echo
echo "=== Docker image tags ==="

rg "FROM |image:" . || true

echo
echo "=== Node runtime pins ==="

find . \
  \( -name ".nvmrc" -o -name "package.json" -o -name "Dockerfile" \) \
  -type f \
  -print
