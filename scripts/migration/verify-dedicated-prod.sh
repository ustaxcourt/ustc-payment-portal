#!/usr/bin/env bash
set -euo pipefail
#
# PAY-332 — verify the dedicated prod account is functional BEFORE cutover/teardown.
#
# READ-ONLY by default. Proves the dedicated account (802939326821,
# ent-apps-payment-portal-workloads-prod) is genuinely ready to BE prod — not just
# that the infrastructure exists. This is the gate before the irreversible steps
# (DNS cutover, isd-prod teardown).
#
# Checks:
#   1. We're in the dedicated account.
#   2. The Pay.gov mTLS secrets + TCS app id are POPULATED (length only — never
#      prints values). This is the thing that makes prod actually work.
#   3. The operational allow-lists (allowed-account-ids, client-permissions) —
#      reported; empty is OK for infra readiness but blocks real client traffic.
#   4. The API Gateway invoke URL resolves.
#   5. (opt-in: SMOKE=1) POST /init against the live API (SigV4-signed) and confirm
#      a token + paymentRedirect come back — i.e. the mTLS path to Pay.gov works.
#      NOTE: a smoke /init writes a transaction row to the prod RDS.
#
# Usage:
#   aws sso login --profile ent-apps-payment-portal-workloads-prod
#   ./scripts/migration/verify-dedicated-prod.sh
#   SMOKE=1 ./scripts/migration/verify-dedicated-prod.sh   # also run the live /init test

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assume.sh
. "${SCRIPT_DIR}/lib/assume.sh"

AWS_REGION="${AWS_REGION:-us-east-1}"
DED_ACCOUNT_ID="${DED_ACCOUNT_ID:-802939326821}"
SECRET_PREFIX="${SECRET_PREFIX:-ustc/pay-gov/prod}"
API_NAME="${API_NAME:-ustc-payment-portal-prod-api-gateway}"
STAGE="${STAGE:-prod}"
SMOKE="${SMOKE:-0}"
: "${AWS_PROFILE:=ent-apps-payment-portal-workloads-prod}"
export AWS_PROFILE AWS_DEFAULT_REGION="$AWS_REGION" AWS_PAGER=""

log_section "Target"
log_info "Profile:  $AWS_PROFILE"
log_info "Account:  $DED_ACCOUNT_ID (ent-apps-payment-portal-workloads-prod, expected)"
log_info "API:      $API_NAME (stage: $STAGE)"

# 1. Identity --------------------------------------------------------------
log_section "1. Identity"
acct=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || true)
if [ "$acct" = "$DED_ACCOUNT_ID" ]; then
  ok "Authenticated to $acct"
else
  bad "Authenticated to '${acct:-none}', expected $DED_ACCOUNT_ID — run: aws sso login --profile $AWS_PROFILE"
  print_summary; exit 1
fi

# 2. Critical secrets populated (length only) -----------------------------
log_section "2. Pay.gov mTLS secrets populated (values never printed)"
# name:min_length — prod can't work unless these hold real values.
for entry in \
  "certificate-pem:1000" \
  "private-key-pem:1000" \
  "cert-passphrase:6" \
  "tcs-app-id:1" \
  "access-token:1" \
  "pay-gov-dev-server-token:1"; do
  name="${entry%%:*}"; min="${entry##*:}"
  len=$(aws secretsmanager get-secret-value --secret-id "${SECRET_PREFIX}/${name}" \
        --query 'length(SecretString)' --output text 2>/dev/null || echo 0)
  case "$len" in (''|*[!0-9]*) len=0 ;; esac
  if [ "$len" -ge "$min" ]; then
    ok "$name populated (len=$len ≥ $min)"
  else
    bad "$name missing/too short (len=$len, need ≥ $min) — prod will fail until set"
  fi
done

# 3. Operational allow-lists (empty OK for infra, blocks client traffic) --
log_section "3. Operational config (empty = no clients yet, not an infra blocker)"
for name in allowed-account-ids client-permissions; do
  len=$(aws secretsmanager get-secret-value --secret-id "${SECRET_PREFIX}/${name}" \
        --query 'length(SecretString)' --output text 2>/dev/null || echo 0)
  case "$len" in (''|*[!0-9]*) len=0 ;; esac
  if [ "$len" -gt 2 ]; then
    ok "$name has entries (len=$len)"
  else
    warn "$name is empty ('[]'/'{}') — populate before onboarding real clients (e.g. DAWSON)"
  fi
done

# 4. API Gateway invoke URL -----------------------------------------------
log_section "4. API Gateway"
api_id=$(aws apigateway get-rest-apis \
  --query "items[?name=='${API_NAME}'].id | [0]" --output text 2>/dev/null || true)
if [ -n "$api_id" ] && [ "$api_id" != "None" ]; then
  API_URL="https://${api_id}.execute-api.${AWS_REGION}.amazonaws.com/${STAGE}"
  ok "API resolved — $API_URL"
else
  bad "API '${API_NAME}' not found"
  API_URL=""
fi

# 5. Optional live smoke test ---------------------------------------------
log_section "5. Smoke test (/init)"
if [ "$SMOKE" != "1" ]; then
  skip "Smoke test not run (set SMOKE=1 to POST /init; it writes a prod transaction row)"
elif [ -z "$API_URL" ]; then
  bad "Cannot smoke test — no API URL"
else
  creds=$(aws configure export-credentials --format env 2>/dev/null || true)
  if [ -z "$creds" ]; then
    warn "Could not export credentials for SigV4 signing — skipping smoke test"
  else
    eval "$creds"
    ref=$(uuidgen | tr 'A-Z' 'a-z')
    body=$(printf '{"transactionReferenceId":"%s","fee":"PETITION_FILING_FEE","urlSuccess":"https://example.com","urlCancel":"https://example.com","metadata":{"docketNumber":"999-99"}}' "$ref")
    resp=$(curl -s -o /tmp/pay332-init.json -w '%{http_code}' -X POST "${API_URL}/init" \
      -H 'Content-Type: application/json' \
      --aws-sigv4 "aws:amz:${AWS_REGION}:execute-api" \
      --user "${AWS_ACCESS_KEY_ID}:${AWS_SECRET_ACCESS_KEY}" \
      -H "x-amz-security-token: ${AWS_SESSION_TOKEN}" \
      --data-binary "$body" 2>/dev/null || echo "000")
    if [ "$resp" = "200" ] && jq -e '.token and .paymentRedirect' /tmp/pay332-init.json >/dev/null 2>&1; then
      ok "/init returned 200 with token + paymentRedirect — mTLS path to Pay.gov works"
    else
      bad "/init returned HTTP $resp (see /tmp/pay332-init.json) — investigate before cutover"
    fi
  fi
fi

print_summary
