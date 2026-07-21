#!/usr/bin/env bash

set -euo pipefail

TF_ROOTS=(
  "terraform/environments/dev"
  "terraform/environments/stg"
  "terraform/environments/prod"
  "terraform/environments/foundation/dev-networking"
  "terraform/environments/foundation/stg-networking"
  "terraform/environments/foundation/prod-networking"
)

INCLUDE_PROD="${INCLUDE_PROD:-false}"

for dir in "${TF_ROOTS[@]}"; do
  [[ -d "$dir" ]] || continue

  if [[ "$INCLUDE_PROD" != "true" && "$dir" =~ prod ]]; then
    echo "Skipping prod root: $dir"
    continue
  fi

  echo
  echo "==== Updating providers: $dir ===="

  (
    cd "$dir"
    terraform init -upgrade -backend=false
  )
done

echo
echo "Terraform provider updates complete."
echo "Review changes with:"
echo "git diff -- '*.lock.hcl'"
