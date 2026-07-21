#!/usr/bin/env bash

set -euo pipefail

usage() {
  echo "Usage: $0 {1000|10000|10000ramp} {full|init}" >&2
}

if [[ $# -ne 2 ]]; then
  usage
  exit 1
fi

profile="$1"
flow="$2"

case "$profile" in
  1000|10000)
    config_name="${profile}-rpm"
    result_name="${profile}-rpm"
    ;;
  10000ramp)
    config_name="10000-rpm-ramp"
    result_name="10000ramp-rpm"
    ;;
  *)
    usage
    exit 1
    ;;
esac

case "$flow" in
  full)
    scenario_name="full-flow"
    ;;
  init)
    scenario_name="init-only"
    ;;
  *)
    usage
    exit 1
    ;;
esac

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
artillery_dir="src/test/performance/artillery"
result_dir="$artillery_dir/results/$(date +%Y%m%d%H%M%S)"
dotenv_path="$repo_root/$artillery_dir/.env"

cd "$repo_root"

if [[ -f "$dotenv_path" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$dotenv_path"
  set +a
fi

role_arn="${ARTILLERY_LAMBDA_ROLE_ARN:-}"
if [[ -z "$role_arn" ]]; then
  echo "ARTILLERY_LAMBDA_ROLE_ARN is not set in $artillery_dir/.env" >&2
  exit 1
fi

target="${ARTILLERY_TARGET:-https://dev-payments.ustaxcourt.gov}"
lambda_count="${ARTILLERY_LAMBDA_COUNT:-1}"
aws_region="${ARTILLERY_LAMBDA_REGION:-${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}}"

echo "Running artillery with target: $target, region: $aws_region, lambda count: $lambda_count, role ARN: $role_arn"

unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
export AWS_REGION="$aws_region"
export AWS_DEFAULT_REGION="$aws_region"

mkdir -p "$result_dir"

exec artillery run-lambda \
  "$artillery_dir/scenarios/${scenario_name}.yml" \
  --config="$artillery_dir/environments/${config_name}.yml" \
  --output "$result_dir/${result_name}-${flow}-results.json" \
  --dotenv "$dotenv_path" \
  --target "$target" \
  --region "$aws_region" \
  --count "$lambda_count" \
  --lambda-role-arn "$role_arn"
