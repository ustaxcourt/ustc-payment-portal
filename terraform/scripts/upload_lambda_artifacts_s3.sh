#!/usr/bin/env bash
set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  sudo apt-get update -y && sudo apt-get install -y jq
fi

GIT_SHA="${GIT_SHA:-${{ github.sha }}}"
PR_NUMBER="${PR_NUMBER:-${{ github.event.pull_request.number }}}"
BUCKET="${BUCKET:-${{ vars.ARTIFACT_BUCKET || 'ustc-payment-portal-build-artifacts' }}}"

FUNCTIONS=(initPayment processPayment getDetails testCert)
PREFIX="artifacts/pr-${PR_NUMBER}/${GIT_SHA}"   #this costructs the path in s3 for PR-env by default
MANIFEST_KEY="manifests/pr-${PR_NUMBER}-${GIT_SHA}.json"    #we need to over-ride this step in dev_deploy job later.

MANIFEST_FILE="$(mktemp)"
jq -n \
  --arg sha "$GIT_SHA" \
  --arg pr "$PR_NUMBER" \
  --arg ts "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
  '{git_sha:$sha, pr_number:$pr, timestamp:$ts, artifacts:{}}' > "$MANIFEST_FILE"

for dir in ../../dist/*; do
  dir=${dir%*/}      # remove the trailing "/"
  FUNC=${dir##*/}  # grab everything after the final "/"
  echo "${FUNC}"
  ZIP="dist/${FUNC}.zip"

  S3_KEY="${PREFIX}/${FUNC}.zip"
  HASH_B64="$(openssl dgst -sha256 -binary "$ZIP" | base64)"

  aws s3 cp "$ZIP" "s3://${BUCKET}/${S3_KEY}" \
    --metadata "git-sha=${GIT_SHA},function-name=${FUNC},sha256_b64=${HASH_B64}"
  echo "Artifact uploaded: s3://${BUCKET}/${S3_KEY}"

  # Update manifest.json
  tmp="$(mktemp)"
  jq --arg f "$FUNC" --arg b "$BUCKET" --arg k "$S3_KEY" --arg h "$HASH_B64" \
     '.artifacts[$f] = {s3_bucket:$b, s3_key:$k, source_code_hash:$h}' \
     "$MANIFEST_FILE" > "$tmp"
  mv "$tmp" "$MANIFEST_FILE"

  # Outputs we can use later in terraform steps (will pass this as input to tf)
  {
    echo "${FUNC}_s3_key=${S3_KEY}"
    echo "${FUNC}_source_code_hash=${HASH_B64}"
  } >> "$GITHUB_OUTPUT"
done

aws s3 cp "$MANIFEST_FILE" "s3://${BUCKET}/${MANIFEST_KEY}" \
  --metadata "git-sha=${GIT_SHA},type=manifest,pr-number=${PR_NUMBER}"

{
  echo "artifact_bucket=${BUCKET}"
  echo "manifest_s3_key=${MANIFEST_KEY}"
  echo "git_sha=${GIT_SHA}"
} >> "$GITHUB_OUTPUT"

echo "Manifest uploaded: s3://${BUCKET}/${MANIFEST_KEY}"
