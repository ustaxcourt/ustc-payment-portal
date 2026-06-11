#!/usr/bin/env bash
# shellcheck shell=bash
#
# Shared helpers for the PAY-332 prod-account migration scripts.
#
# Provides:
#   - colored logging helpers (log_*, ok, bad, warn, record, print_summary)
#   - cross-account role assumption (cache_assume / with_creds)
#
# Sourced by every scripts/migration/*.sh. Read-only on its own — it never
# mutates AWS. Kept bash 3.2-compatible (macOS default) so it runs locally and
# in CI: no associative arrays, no `local -n` namerefs.

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
if [ -t 1 ] && [ "${NO_COLOR:-}" != "1" ]; then
  C_RESET=$'\033[0m'; C_RED=$'\033[31m'; C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'; C_BLUE=$'\033[34m'; C_BOLD=$'\033[1m'
else
  C_RESET=''; C_RED=''; C_GREEN=''; C_YELLOW=''; C_BLUE=''; C_BOLD=''
fi

log_section() { printf '\n%s== %s ==%s\n' "$C_BOLD$C_BLUE" "$1" "$C_RESET"; }
log_info()    { printf '%s\n' "$1"; }

# Result tracking. Each entry: "STATUS|SEVERITY|LABEL"
SUMMARY=()
REQUIRED_FAILURES=0

# record STATUS SEVERITY LABEL
record() { SUMMARY+=("$1|$2|$3"); }

# ok / warn / bad take: LABEL [SEVERITY]  (SEVERITY default REQUIRED)
ok()   { printf '  %s✓%s %s\n' "$C_GREEN" "$C_RESET" "$1"; record PASS "${2:-REQUIRED}" "$1"; }
warn() { printf '  %s!%s %s\n' "$C_YELLOW" "$C_RESET" "$1"; record WARN "${2:-OPTIONAL}" "$1"; }
# skip — a check intentionally not run because a decision made it unnecessary.
# Never a failure; recorded so the matrix shows what was deliberately bypassed.
skip() { printf '  %s∘%s %s\n' "$C_BLUE" "$C_RESET" "$1"; record SKIP "N/A" "$1"; }
bad()  {
  printf '  %s✗%s %s\n' "$C_RED" "$C_RESET" "$1"
  record FAIL "${2:-REQUIRED}" "$1"
  if [ "${2:-REQUIRED}" = "REQUIRED" ]; then
    REQUIRED_FAILURES=$((REQUIRED_FAILURES + 1))
  fi
}

# print_summary — renders the matrix and returns non-zero if any REQUIRED failed.
print_summary() {
  log_section "Summary"
  local entry status severity label icon color
  for entry in "${SUMMARY[@]}"; do
    status=${entry%%|*}; entry=${entry#*|}
    severity=${entry%%|*}; label=${entry#*|}
    case "$status" in
      PASS) icon='✓'; color=$C_GREEN ;;
      WARN) icon='!'; color=$C_YELLOW ;;
      SKIP) icon='∘'; color=$C_BLUE ;;
      FAIL) icon='✗'; color=$C_RED ;;
      *)    icon='?'; color=$C_RESET ;;
    esac
    printf '  %s%s%s  %-9s %s\n' "$color" "$icon" "$C_RESET" "[$severity]" "$label"
  done

  printf '\n'
  if [ "$REQUIRED_FAILURES" -eq 0 ]; then
    printf '%sPASSED%s — no required checks failed.\n' \
      "$C_GREEN$C_BOLD" "$C_RESET"
    return 0
  fi
  printf '%sFAILED%s — %d required check(s) failed. Resolve before proceeding.\n' \
    "$C_RED$C_BOLD" "$C_RESET" "$REQUIRED_FAILURES"
  return 1
}

# ---------------------------------------------------------------------------
# Account resolution — no hardcoded accounts
# ---------------------------------------------------------------------------
# require_account <id-or-profile>
#   - a 12-digit account ID  -> used as a GUARD against the active credentials
#                               (you must already be authenticated to it).
#   - anything else          -> treated as an AWS profile name and selected via
#                               AWS_PROFILE.
#   On success sets the global RESOLVED_ACCOUNT and returns 0; on failure it
#   prints a bad() line and returns 1 (callers should print_summary; exit 1).
export RESOLVED_ACCOUNT=""   # set by require_account, consumed by the sourcing scripts
require_account() {
  local arg="${1:-}" expected="" acct
  if [ -z "$arg" ]; then bad "account (12-digit id or profile name) is required"; return 1; fi
  if printf '%s' "$arg" | grep -qE '^[0-9]{12}$'; then
    expected="$arg"
  else
    export AWS_PROFILE="$arg"
  fi
  acct=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || true)
  if [ -z "$acct" ]; then
    bad "No valid credentials for '$arg' — run: aws sso login --profile <profile>"; return 1
  fi
  if [ -n "$expected" ] && [ "$acct" != "$expected" ]; then
    bad "Authenticated to $acct but you asked for $expected — refusing."; return 1
  fi
  RESOLVED_ACCOUNT="$acct"
  return 0
}

# ---------------------------------------------------------------------------
# Cross-account role assumption
# ---------------------------------------------------------------------------
# cache_assume PREFIX ROLE_ARN SESSION_NAME
#   Assumes ROLE_ARN and caches the temporary credentials in shell variables
#   ${PREFIX}_AK / ${PREFIX}_SK / ${PREFIX}_ST. If ROLE_ARN is empty, marks the
#   context as "base" so with_creds uses the ambient credentials (i.e. you are
#   already authenticated into that account). Returns non-zero if assume fails.
cache_assume() {
  local prefix="$1" arn="$2" session="$3"

  if [ -z "$arn" ]; then
    printf -v "${prefix}_BASE" '%s' "1"
    return 0
  fi
  printf -v "${prefix}_BASE" '%s' "0"

  local json
  if ! json=$(aws sts assume-role \
    --role-arn "$arn" \
    --role-session-name "$session" \
    --duration-seconds 900 \
    --output json 2>/dev/null); then
    return 1
  fi

  printf -v "${prefix}_AK" '%s' "$(printf '%s' "$json" | jq -r '.Credentials.AccessKeyId')"
  printf -v "${prefix}_SK" '%s' "$(printf '%s' "$json" | jq -r '.Credentials.SecretAccessKey')"
  printf -v "${prefix}_ST" '%s' "$(printf '%s' "$json" | jq -r '.Credentials.SessionToken')"
  return 0
}

# with_creds PREFIX <command...>
#   Runs <command...> using the credentials cached under PREFIX. If the context
#   is "base", runs with ambient credentials. Never mutates the parent shell env.
with_creds() {
  local prefix="$1"; shift
  local base_v="${prefix}_BASE"
  if [ "${!base_v:-0}" = "1" ]; then
    "$@"
    return $?
  fi
  local ak_v="${prefix}_AK" sk_v="${prefix}_SK" st_v="${prefix}_ST"
  AWS_ACCESS_KEY_ID="${!ak_v}" \
  AWS_SECRET_ACCESS_KEY="${!sk_v}" \
  AWS_SESSION_TOKEN="${!st_v}" \
    "$@"
}
