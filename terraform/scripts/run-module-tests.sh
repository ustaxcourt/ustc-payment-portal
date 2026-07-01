#!/bin/bash

# Runs native Terraform tests (terraform test) for the reusable modules under
# terraform/modules. Tests are plan-only and use mock_provider, so NO AWS
# credentials are required and nothing is provisioned.
#
# Usage:
#   terraform/scripts/run-module-tests.sh              # test all modules with tests/
#   terraform/scripts/run-module-tests.sh rds secrets  # test only the named modules

set -euo pipefail

# Change to the repo root regardless of where the script is invoked from.
cd "$(dirname "$0")/../.."

MODULES_DIR="terraform/modules"

if [ "$#" -gt 0 ]; then
  MODULES=("$@")
else
  # Discover every module that has a tests/ directory.
  MODULES=()
  for dir in "$MODULES_DIR"/*/; do
    if [ -d "${dir}tests" ]; then
      MODULES+=("$(basename "$dir")")
    fi
  done
fi

if [ "${#MODULES[@]}" -eq 0 ]; then
  echo "No modules with tests/ found under $MODULES_DIR"
  exit 0
fi

failed=()

for module in "${MODULES[@]}"; do
  module_path="$MODULES_DIR/$module"

  if [ ! -d "$module_path/tests" ]; then
    echo "Skipping $module (no tests/ directory)"
    continue
  fi

  echo ""
  echo "=== terraform test: $module ==="
  (
    cd "$module_path"
    # -backend=false keeps init fully offline (no state bucket needed).
    terraform init -backend=false -input=false >/dev/null
    terraform test
  ) || failed+=("$module")
done

echo ""
if [ "${#failed[@]}" -gt 0 ]; then
  echo "FAILED modules: ${failed[*]}"
  exit 1
fi

echo "All Terraform module tests passed."
