#!/usr/bin/env bash
set -euo pipefail

# Promote Lambda artifacts from PR environment to Dev/Staging/Prod
# This script copies artifacts from a PR build to a target environment

if ! command -v jq >/dev/null 2>&1; then
  sudo apt-get update -y && sudo apt-get install -y jq
fi

# Environment variables must be set by caller:
# - GIT_SHA: Git commit SHA (optional - will auto-discover from S3 if not provided)
# - PR_NUMBER: Pull request number (source)
# - BUCKET: S3 bucket name for artifacts
# - TARGET_ENV: Target environment (dev, staging, prod)

if [ -z "$PR_NUMBER" ] || [ -z "$BUCKET" ] || [ -z "$TARGET_ENV" ]; then
  echo "Error: Required environment variables not set (PR_NUMBER, BUCKET, TARGET_ENV)"
  exit 1
fi

# Auto-discover GIT_SHA from S3 if not provided
if [ -z "$GIT_SHA" ]; then
  echo "GIT_SHA not provided, discovering latest SHA from S3..."

  # List objects in the PR prefix and find the most recently modified one
  PR_PREFIX="artifacts/pr-${PR_NUMBER}/"

  # Get the latest object key and extract the SHA from it
  # S3 path structure: artifacts/pr-123/abc123def456.../functionName.zip
  LATEST_KEY=$(aws s3api list-objects-v2 \
    --bucket "${BUCKET}" \
    --prefix "${PR_PREFIX}" \
    --query 'reverse(sort_by(Contents, &LastModified))[0].Key' \
    --output text)

  if [ -z "$LATEST_KEY" ] || [ "$LATEST_KEY" = "None" ]; then
    echo "Error: No artifacts found for PR ${PR_NUMBER} in s3://${BUCKET}/${PR_PREFIX}"
    echo "Please ensure the PR build has uploaded artifacts before attempting to promote."
    exit 1
  fi

  # Extract SHA from path: artifacts/pr-123/SHA/file.zip -> SHA
  GIT_SHA=$(echo "$LATEST_KEY" | cut -d'/' -f3)

  if [ -z "$GIT_SHA" ]; then
    echo "Error: Could not extract GIT_SHA from S3 path: $LATEST_KEY"
    exit 1
  fi

  echo "Discovered GIT_SHA: $GIT_SHA"
fi

SOURCE_PREFIX="artifacts/pr-${PR_NUMBER}/${GIT_SHA}"
TARGET_PREFIX="artifacts/${TARGET_ENV}/${GIT_SHA}"

echo "========================================="
echo "Promoting Lambda Artifacts"
echo "========================================="
echo "Source: s3://${BUCKET}/${SOURCE_PREFIX}/"
echo "Target: s3://${BUCKET}/${TARGET_PREFIX}/"
echo "========================================="

# Check if source artifacts exist
if ! aws s3 ls "s3://${BUCKET}/${SOURCE_PREFIX}/" >/dev/null 2>&1; then
  echo "Error: Source artifacts not found at s3://${BUCKET}/${SOURCE_PREFIX}/"
  echo "This usually means:"
  echo "  1. The PR build artifacts were not uploaded"
  echo "  2. The PR number or SHA is incorrect"
  echo "  3. The artifacts have been deleted by lifecycle policy"
  exit 1
fi

# Copy artifacts from PR location to target environment
echo "Copying artifacts..."
aws s3 cp "s3://${BUCKET}/${SOURCE_PREFIX}/" \
          "s3://${BUCKET}/${TARGET_PREFIX}/" \
          --recursive \
          --metadata-directive COPY

echo "Artifacts promoted successfully!"

# Download the source manifest to get artifact metadata
SOURCE_MANIFEST_KEY="manifests/pr-${PR_NUMBER}-${GIT_SHA}.json"
MANIFEST_FILE="$(mktemp)"

echo "Downloading source manifest: s3://${BUCKET}/${SOURCE_MANIFEST_KEY}"
aws s3 cp "s3://${BUCKET}/${SOURCE_MANIFEST_KEY}" "$MANIFEST_FILE"

# Create new manifest for target environment
TARGET_MANIFEST_KEY="manifests/${TARGET_ENV}-${GIT_SHA}.json"
TARGET_MANIFEST_FILE="$(mktemp)"

jq --arg env "$TARGET_ENV" \
   --arg prefix "$TARGET_PREFIX" \
   '. + {
     environment: $env,
     promoted_from: ("pr-" + .pr_number),
     promoted_at: (now | strftime("%Y-%m-%dT%H:%M:%SZ"))
   } | .artifacts |= with_entries(.value.s3_key = ($prefix + "/" + (.key) + ".zip"))' \
   "$MANIFEST_FILE" > "$TARGET_MANIFEST_FILE"

# Upload target environment manifest
aws s3 cp "$TARGET_MANIFEST_FILE" "s3://${BUCKET}/${TARGET_MANIFEST_KEY}" \
  --metadata "git-sha=${GIT_SHA},type=manifest,environment=${TARGET_ENV}"

echo "Manifest uploaded: s3://${BUCKET}/${TARGET_MANIFEST_KEY}"

# Parse artifacts and output to GITHUB_OUTPUT for Terraform
echo "Extracting artifact metadata for Terraform..."
jq -r '.artifacts | to_entries[] | "\(.key)_s3_key=\(.value.s3_key)\n\(.key)_source_code_hash=\(.value.source_code_hash)"' \
  "$TARGET_MANIFEST_FILE" >> "$GITHUB_OUTPUT"

# Output bucket info
{
  echo "artifact_bucket=${BUCKET}"
  echo "manifest_s3_key=${TARGET_MANIFEST_KEY}"
  echo "git_sha=${GIT_SHA}"
} >> "$GITHUB_OUTPUT"

echo ""
echo "========================================="
echo "Promotion Complete!"
echo "========================================="
echo "Artifacts available at:"
for func in initPayment processPayment getDetails testCert; do
  echo "  - ${func}: s3://${BUCKET}/${TARGET_PREFIX}/${func}.zip"
done
echo "========================================="
