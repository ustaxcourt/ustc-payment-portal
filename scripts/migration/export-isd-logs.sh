#!/usr/bin/env bash
set -euo pipefail
#
# PAY-332 — export CloudWatch logs for the SharePoint backup (AC #2).
#
# READ-ONLY against AWS. Pulls every event from each matching log group in the
# given account into a dated local folder, ready to upload to SharePoint. For
# each log group it writes:
#   - <group>.json  — full-fidelity events (timestamp + message + stream)
#   - <group>.log   — human-readable (UTC time + message)
# plus a MANIFEST.txt describing the export (source, date, counts, AC reference).
#
# Volume is small, so a direct CLI pull is simpler and sufficient — no S3
# export-task / bucket-policy plumbing needed.
#
# Args (or env): ACCOUNT ($1, id or profile — required), LOG_PREFIX ($2).
#
# Usage:
#   aws sso login --profile ustc-aws-isd-prod
#   ./scripts/migration/export-isd-logs.sh ustc-aws-isd-prod
#   # then upload the printed folder to the SharePoint backup location.
#
# Override via env: ACCOUNT, LOG_PREFIX, AWS_REGION, OUT_DIR.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assume.sh
. "${SCRIPT_DIR}/lib/assume.sh"

AWS_REGION="${AWS_REGION:-us-east-1}"
ACCOUNT="${1:-${ACCOUNT:-}}"          # required: account id (guard) or profile name
LOG_PREFIX="${2:-${LOG_PREFIX:-/aws/lambda/ustc-payment-processor}}"
export AWS_DEFAULT_REGION="$AWS_REGION" AWS_PAGER=""

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${OUT_DIR:-$HOME/log-backup-${STAMP}}"

log_section "Export CloudWatch logs (AC #2)"
log_info "Account arg: ${ACCOUNT:-<required: id or profile>}"
log_info "Log prefix:  $LOG_PREFIX"
log_info "Output dir:  $OUT_DIR"

# Resolve + guard the account (id or profile); grab the caller ARN for the manifest.
if ! require_account "$ACCOUNT"; then print_summary; exit 1; fi
acct="$RESOLVED_ACCOUNT"
caller_arn=$(aws sts get-caller-identity --query 'Arn' --output text 2>/dev/null || echo "$acct")
ok "Authenticated to $acct"

# Enumerate log groups. Parse via --output json + jq (NOT --output text +
# word-splitting, which is unsafe: shell glob/IFS expansion can mangle the list).
# Read through a here-string to stay bash 3.2-compatible and avoid mapfile.
# NOTE: do NOT name this array GROUPS — that is a special bash variable (the
# caller's group IDs) and `GROUPS=()` cannot reset it, silently corrupting the list.
groups_json=$(aws logs describe-log-groups \
  --log-group-name-prefix "$LOG_PREFIX" \
  --query 'logGroups[].logGroupName' --output json 2>/dev/null || echo '[]')
LOG_GROUPS=()
while IFS= read -r line; do
  [ -n "$line" ] && LOG_GROUPS+=("$line")
done <<< "$(printf '%s' "$groups_json" | jq -r '.[]')"

if [ "${#LOG_GROUPS[@]}" -eq 0 ]; then
  bad "No log groups found under '$LOG_PREFIX'"
  print_summary; exit 1
fi
ok "${#LOG_GROUPS[@]} log group(s) to export"

mkdir -p "$OUT_DIR"
MANIFEST="$OUT_DIR/MANIFEST.txt"
{
  echo "PAY-332 — CloudWatch log backup (AC #2)"
  echo "Source account : $acct"
  echo "Region         : $AWS_REGION"
  echo "Exported (UTC) : $STAMP"
  echo "Exported by    : ${caller_arn:-$acct}"
  echo "Log prefix     : $LOG_PREFIX"
  echo ""
  echo "Group | events | bytes(json) | bytes(stored)"
} > "$MANIFEST"

total_events=0
for g in "${LOG_GROUPS[@]}"; do
  safe="${g//\//_}"; safe="${safe#_}"
  json="$OUT_DIR/${safe}.json"
  text="$OUT_DIR/${safe}.log"

  # Full-fidelity events (auto-paginates in AWS CLI v2).
  aws logs filter-log-events --log-group-name "$g" --start-time 0 \
    --query 'events[].{ts:timestamp,stream:logStreamName,message:message}' \
    --output json > "$json" 2>/dev/null || echo '[]' > "$json"

  # Human-readable rendering (UTC time + message). Format the epoch-ms timestamp
  # inside jq (gmtime/strftime) so it's robust to multi-line messages and portable
  # (no BSD-vs-GNU `date` differences). One output line per event.
  jq -r '.[] | "\((.ts/1000|floor|gmtime|strftime("%Y-%m-%dT%H:%M:%SZ"))) \(.message | gsub("\n";" "))"' \
    "$json" > "$text" 2>/dev/null || : > "$text"

  ev=$(jq 'length' "$json" 2>/dev/null || echo 0)
  jb=$(wc -c < "$json" | tr -d ' ')
  sb=$(aws logs describe-log-groups --log-group-name-prefix "$g" \
        --query 'logGroups[0].storedBytes' --output text 2>/dev/null || echo "?")
  total_events=$(( total_events + ev ))
  ok "$g — $ev events, ${jb}B json"
  echo "$g | $ev | $jb | $sb" >> "$MANIFEST"
done

echo "" >> "$MANIFEST"
echo "Total events: $total_events" >> "$MANIFEST"

log_section "Done"
ok "Exported $total_events events from ${#LOG_GROUPS[@]} group(s)"
log_info ""
log_info "Backup folder ready to upload to SharePoint:"
log_info "  $OUT_DIR"
log_info ""
log_info "Next: upload that folder to the SharePoint backup location, then AC #2 is met."
print_summary
