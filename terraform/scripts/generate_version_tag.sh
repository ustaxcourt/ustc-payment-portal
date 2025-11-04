#!/bin/bash

# Generate calendar-based semantic version tags
# Format: vYYYY.MM.BUILD-rc.N (for staging) or vYYYY.MM.BUILD (for production)
#
# Usage:
#   ./generate_version_tag.sh staging  # Creates v2025.11.1-rc.1
#   ./generate_version_tag.sh production --from-rc v2025.11.1-rc.3  # Creates v2025.11.1
#
# Environment variables:
#   TAG_PREFIX: Optional prefix for tags (default: 'v')

set -euo pipefail

ENVIRONMENT="${1:-staging}"
TAG_PREFIX="${TAG_PREFIX:-v}"

# Validate environment
if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
  echo "Error: Environment must be 'staging' or 'production'" >&2
  exit 1
fi

# Get current year and month
YEAR=$(date +%Y)
MONTH=$(date +%-m)  # Remove leading zero
VERSION_PREFIX="${TAG_PREFIX}${YEAR}.${MONTH}"

echo "Generating ${ENVIRONMENT} version tag..."
echo "Version prefix: ${VERSION_PREFIX}"

# Fetch all tags to ensure we have the latest
git fetch --tags 2>/dev/null || true

if [[ "$ENVIRONMENT" == "production" ]]; then
  # Production mode: Convert RC tag to stable
  if [[ "${2:-}" == "--from-rc" ]]; then
    RC_TAG="${3:-}"
    if [[ -z "$RC_TAG" ]]; then
      echo "Error: --from-rc requires a tag argument" >&2
      exit 1
    fi

    # Verify RC tag exists
    if ! git rev-parse -q --verify "refs/tags/${RC_TAG}" >/dev/null; then
      echo "Error: RC tag '${RC_TAG}' does not exist" >&2
      exit 1
    fi

    # Strip -rc.N suffix to get production version
    PROD_TAG=$(echo "$RC_TAG" | sed -E 's/-rc\.[0-9]+$//')

    # Check if production tag already exists
    if git rev-parse -q --verify "refs/tags/${PROD_TAG}" >/dev/null; then
      echo "Error: Production tag '${PROD_TAG}' already exists" >&2
      exit 1
    fi

    echo "VERSION=${PROD_TAG}"
    echo "RC_TAG=${RC_TAG}"
    exit 0
  else
    echo "Error: Production mode requires --from-rc <rc-tag>" >&2
    exit 1
  fi
fi

# Staging mode: Generate new RC version
echo "Fetching existing tags for ${VERSION_PREFIX}..."

# Get all tags matching current month (both RC and stable)
EXISTING_TAGS=$(git tag -l "${VERSION_PREFIX}.*" 2>/dev/null || echo "")

if [[ -z "$EXISTING_TAGS" ]]; then
  # First release of the month
  BUILD_NUMBER=1
  RC_NUMBER=1
  echo "First release this month"
else
  echo "Existing tags found:"
  echo "$EXISTING_TAGS"

  # Extract the highest BUILD number from all tags (RC and stable)
  # Tags can be: v2025.11.1, v2025.11.1-rc.1, v2025.11.2-rc.1, etc.
  MAX_BUILD=$(echo "$EXISTING_TAGS" | sed -E "s|^${VERSION_PREFIX}\.([0-9]+).*|\1|" | sort -n | tail -1)

  # Check if any RC tags exist for the latest build
  LATEST_RC_TAGS=$(echo "$EXISTING_TAGS" | grep -E "^${VERSION_PREFIX}\.${MAX_BUILD}-rc\.[0-9]+$" || echo "")

  if [[ -n "$LATEST_RC_TAGS" ]]; then
    # RC tags exist for current build, increment RC number
    BUILD_NUMBER=$MAX_BUILD
    MAX_RC=$(echo "$LATEST_RC_TAGS" | sed -E "s|^${VERSION_PREFIX}\.${MAX_BUILD}-rc\.([0-9]+)$|\1|" | sort -n | tail -1)
    RC_NUMBER=$((MAX_RC + 1))
    echo "Incrementing RC for build ${BUILD_NUMBER}: rc.${MAX_RC} -> rc.${RC_NUMBER}"
  else
    # No RC tags for current build, start new build
    BUILD_NUMBER=$((MAX_BUILD + 1))
    RC_NUMBER=1
    echo "Starting new build: ${BUILD_NUMBER}"
  fi
fi

NEW_TAG="${VERSION_PREFIX}.${BUILD_NUMBER}-rc.${RC_NUMBER}"

echo "Generated version: ${NEW_TAG}"
echo "VERSION=${NEW_TAG}"

# Output for GitHub Actions
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "version=${NEW_TAG}" >> "$GITHUB_OUTPUT"
  echo "build_number=${BUILD_NUMBER}" >> "$GITHUB_OUTPUT"
  echo "rc_number=${RC_NUMBER}" >> "$GITHUB_OUTPUT"
fi
