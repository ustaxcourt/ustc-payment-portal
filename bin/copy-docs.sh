#!/usr/bin/env bash
set -euo pipefail

# Ensure destination exists
mkdir -p docs

# Find only Markdown files in repo root (depth 1), excluding docs/
# Works on GNU find (Linux) and BSD find (macOS)
find . -maxdepth 1 -type f -name '*.md' ! -path './docs/*' -print0 \
| while IFS= read -r -d '' f; do
  base="$(basename "$f")"
  cp -f "$f" "docs/$base"
  echo "Copied $f → docs/$base"
done
``
