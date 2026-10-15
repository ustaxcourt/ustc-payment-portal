#!/usr/bin/env bash
# Shared by ci.yml and ci-fork-pr.yml so the accepted list lives in one place.

set -euo pipefail

# Every ID here must have an "Accepted vulnerabilities" entry in docs/dependency-caveats.md.
ACCEPTED_ADVISORIES="GHSA-vfj7-8cjw-p6xm"

# No exceptions: an accepted advisory that reaches runtime deps must fail, not pass by ID.
npm audit --omit=dev --audit-level=high --package-lock-only

audit_json=$(mktemp)
npm audit --package-lock-only --json > "$audit_json" || true
jq -e '.vulnerabilities' "$audit_json" > /dev/null || { cat "$audit_json"; exit 1; }
unaccepted=$(jq -r --arg accepted "$ACCEPTED_ADVISORIES" '
  ($accepted | split(" ")) as $ok
  | [.vulnerabilities[].via[] | objects
     | select(.severity == "high" or .severity == "critical")
     | .url | split("/") | last]
  | unique | map(select(. as $id | $ok | index($id) | not)) | .[]
' "$audit_json")
if [ -n "$unaccepted" ]; then
  echo "Unaccepted high/critical advisories:"
  echo "$unaccepted"
  exit 1
fi
