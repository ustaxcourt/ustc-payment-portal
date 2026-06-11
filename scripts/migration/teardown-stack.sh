#!/usr/bin/env bash
set -euo pipefail
#
# Delete a single CloudFormation stack — safely, with guards. Nothing hardcoded:
# you pass the target account and the stack name. Built for PAY-332 (removing the
# Serverless-deployed Payment Portal stack from the shared isd-prod account), but
# generic enough for any one-stack teardown.
#
# Safety model:
#   - You must name the EXACT stack — no wildcards, only that stack is touched.
#   - The script asserts it's running in the account you named (wrong-account guard).
#   - DRY RUN by default — it shows what it WOULD delete. Real deletion needs CONFIRM=yes.
#   - Empties the stack's S3 buckets first (CFN can't delete a non-empty bucket).
#   - Handles DELETE_FAILED on already-gone resources (e.g. a transferred EIP) by
#     retrying with --retain-resources so the rest of the stack still deletes.
#
# Usage (account can be a 12-digit ID *or* an AWS profile name):
#   aws sso login --profile ustc-aws-isd-prod
#   ./scripts/migration/teardown-stack.sh ustc-aws-isd-prod ustc-payment-processor-prod          # dry run
#   CONFIRM=yes ./scripts/migration/teardown-stack.sh 402985502068 ustc-payment-processor-prod   # real
#
# Args (or env): ACCOUNT ($1 / TARGET_ACCOUNT), STACK ($2 / STACK_NAME).
# Env: AWS_REGION (default us-east-1), CONFIRM (default no), AWS_PROFILE.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assume.sh
. "${SCRIPT_DIR}/lib/assume.sh"

ACCOUNT="${1:-${TARGET_ACCOUNT:-}}"
STACK="${2:-${STACK_NAME:-}}"
AWS_REGION="${AWS_REGION:-us-east-1}"
CONFIRM="${CONFIRM:-no}"
export AWS_DEFAULT_REGION="$AWS_REGION" AWS_PAGER=""

# --- Inputs are required; nothing is hardcoded -------------------------------
if [ -z "$ACCOUNT" ] || [ -z "$STACK" ]; then
  echo "usage: $0 <account-id-or-profile> <stack-name>   (CONFIRM=yes to delete)" >&2
  exit 1
fi
case "$STACK" in *'*'*|*'?'*|'') echo "Refusing: stack name must be exact (no wildcards)." >&2; exit 1;; esac

# Account arg may be a 12-digit ID (used as a guard) or a profile name (selected).
EXPECTED_ACCT=""
if printf '%s' "$ACCOUNT" | grep -qE '^[0-9]{12}$'; then
  EXPECTED_ACCT="$ACCOUNT"
else
  export AWS_PROFILE="$ACCOUNT"
fi

log_section "Target"
log_info "Account arg:  $ACCOUNT"
log_info "Stack:        $STACK"
log_info "Region:       $AWS_REGION"
log_info "Mode:         $([ "$CONFIRM" = "yes" ] && echo 'DELETE (CONFIRM=yes)' || echo 'DRY RUN (set CONFIRM=yes to delete)')"

# --- 1. Account guard --------------------------------------------------------
log_section "1. Account guard"
acct=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || true)
if [ -z "$acct" ]; then
  bad "No valid credentials — run: aws sso login --profile <profile>"; print_summary; exit 1
fi
if [ -n "$EXPECTED_ACCT" ] && [ "$acct" != "$EXPECTED_ACCT" ]; then
  bad "Authenticated to $acct but you asked for $EXPECTED_ACCT — refusing."; print_summary; exit 1
fi
ok "Operating in account $acct"

# --- 2. Stack exists ---------------------------------------------------------
log_section "2. Stack '$STACK'"
status=$(aws cloudformation describe-stacks --stack-name "$STACK" \
  --query 'Stacks[0].StackStatus' --output text 2>/dev/null || true)
if [ -z "$status" ]; then
  bad "Stack '$STACK' not found in account $acct."; print_summary; exit 1
fi
ok "Found — status $status"

# --- 3. What will be deleted -------------------------------------------------
log_section "3. Resources this delete will remove"
res=$(aws cloudformation list-stack-resources --stack-name "$STACK" \
  --query 'StackResourceSummaries[].{T:ResourceType,P:PhysicalResourceId}' --output json 2>/dev/null || echo '[]')
printf '%s' "$res" | jq -r '.[].T' | sort | uniq -c | sort -rn | sed 's/^/    /'
buckets=$(printf '%s' "$res" | jq -r '.[] | select(.T=="AWS::S3::Bucket") | .P')
if [ -n "$buckets" ]; then
  warn "S3 buckets to empty first (CFN can't delete a non-empty bucket):"
  printf '%s\n' "$buckets" | sed 's/^/      /'
fi

# --- 4. Show OTHER stacks (must stay untouched) ------------------------------
log_section "4. Other stacks in this account (NOT touched)"
others=$(aws cloudformation list-stacks \
  --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE ROLLBACK_COMPLETE UPDATE_ROLLBACK_COMPLETE IMPORT_COMPLETE \
  --query "StackSummaries[?StackName!='${STACK}'].StackName" --output text 2>/dev/null || true)
if [ -n "$others" ]; then
  printf '%s\n' "$others" | tr '\t' '\n' | sed 's/^/    /'
else
  log_info "    (none)"
fi

# --- 5. Dry run stops here ---------------------------------------------------
if [ "$CONFIRM" != "yes" ]; then
  log_section "Dry run"
  ok "Nothing deleted. Re-run with CONFIRM=yes to delete ONLY stack '$STACK'."
  print_summary; exit 0
fi

# --- 6. Empty the stack's S3 buckets (incl. all versions) --------------------
empty_bucket() {
  local b="$1" delfile
  delfile=$(mktemp)   # unique per run — never clobber a fixed /tmp path
  trap 'rm -f "$delfile"' RETURN
  while :; do
    local v n
    v=$(aws s3api list-object-versions --bucket "$b" --max-items 500 \
      --query '{Objects: [Versions[].{Key:Key,VersionId:VersionId}, DeleteMarkers[].{Key:Key,VersionId:VersionId}][]}' \
      --output json 2>/dev/null || echo '{"Objects":null}')
    n=$(printf '%s' "$v" | jq '(.Objects // []) | length')
    [ "$n" -eq 0 ] && break
    printf '%s' "$v" | jq '{Objects: (.Objects // []), Quiet: true}' > "$delfile"
    aws s3api delete-objects --bucket "$b" --delete "file://$delfile" >/dev/null
  done
}
if [ -n "$buckets" ]; then
  log_section "5. Emptying S3 buckets"
  while IFS= read -r b; do
    [ -z "$b" ] && continue
    empty_bucket "$b" && ok "emptied $b"
  done <<< "$buckets"
fi

# --- 7. Delete the stack, retrying past already-gone resources ---------------
log_section "6. Deleting stack '$STACK'"
aws cloudformation delete-stack --stack-name "$STACK"
if aws cloudformation wait stack-delete-complete --stack-name "$STACK" 2>/dev/null; then
  ok "Stack deleted."
else
  st=$(aws cloudformation describe-stacks --stack-name "$STACK" --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo GONE)
  if [ "$st" = "GONE" ]; then
    ok "Stack deleted."
  elif [ "$st" = "DELETE_FAILED" ]; then
    failed=$(aws cloudformation describe-stack-resources --stack-name "$STACK" \
      --query "StackResources[?ResourceStatus=='DELETE_FAILED'].LogicalResourceId" --output text 2>/dev/null)
    warn "DELETE_FAILED on already-gone/locked resources: $failed — retrying with --retain-resources"
    # shellcheck disable=SC2086
    aws cloudformation delete-stack --stack-name "$STACK" --retain-resources $failed
    if aws cloudformation wait stack-delete-complete --stack-name "$STACK" 2>/dev/null; then
      ok "Stack deleted (retained $failed — verify those are truly gone)."
    else
      bad "Stack still not deleted — investigate manually."; print_summary; exit 1
    fi
  else
    bad "Unexpected stack status '$st' — investigate manually."; print_summary; exit 1
  fi
fi

# --- 8. Confirm it's gone ----------------------------------------------------
log_section "7. Verify"
if aws cloudformation describe-stacks --stack-name "$STACK" >/dev/null 2>&1; then
  bad "Stack '$STACK' still present."
else
  ok "Confirmed gone from account $acct."
fi
print_summary
