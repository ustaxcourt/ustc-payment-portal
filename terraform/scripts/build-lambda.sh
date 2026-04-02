#!/bin/bash

# Build script for Lambda deployment

set -e

echo "Building Lambda functions for deployment..."

# Change to project root directory
cd "$(dirname "$0")/../.."

# Clean previous builds
echo "Cleaning previous builds..."
rm -rf dist/
rm -f terraform/lambda-*.js
rm -f terraform/lambda-*-deployment.zip

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm ci --production=false
fi

# Bundle each Lambda function individually using esbuild
echo "Bundling Lambda functions with esbuild..."

# Knex optional dialect modules — not used at runtime (pg is used); must be excluded
# from all bundles that transitively import knex (lambdaHandler.ts → knex.ts → knex).
KNEX_EXTERNALS=(
  --external:sqlite3
  --external:mysql
  --external:mysql2
  --external:tedious
  --external:pg-query-stream
  --external:better-sqlite3
  --external:oracledb
)

# Bundle Init Payment Lambda
echo "Bundling initPayment..."
mkdir -p dist/initPayment
npx esbuild src/lambdaHandler.ts \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=cjs \
  --outfile=dist/initPayment/lambdaHandler.js \
  --external:aws-sdk \
  --external:@aws-sdk/* \
  "${KNEX_EXTERNALS[@]}" \
  --minify \
  --keep-names

# Bundle Process Payment Lambda
echo "Bundling processPayment..."
mkdir -p dist/processPayment
npx esbuild src/lambdaHandler.ts \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=cjs \
  --outfile=dist/processPayment/lambdaHandler.js \
  --external:aws-sdk \
  --external:@aws-sdk/* \
  "${KNEX_EXTERNALS[@]}" \
  --minify \
  --keep-names

# Bundle Get Details Lambda
echo "Bundling getDetails..."
mkdir -p dist/getDetails
npx esbuild src/lambdaHandler.ts \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=cjs \
  --outfile=dist/getDetails/lambdaHandler.js \
  --external:aws-sdk \
  --external:@aws-sdk/* \
  "${KNEX_EXTERNALS[@]}" \
  --minify \
  --keep-names

# Bundle Test Cert Lambda
echo "Bundling testCert..."
mkdir -p dist/testCert
npx esbuild src/testCert.ts \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=cjs \
  --outfile=dist/testCert/lambdaHandler.js \
  --external:aws-sdk \
  --external:@aws-sdk/* \
  --minify \
  --keep-names

# Bundle Dashboard Lambdas (all share lambdaHandler.ts entry)
for func in getAllTransactions getTransactionsByStatus getTransactionPaymentStatus; do
  echo "Bundling ${func}..."
  mkdir -p "dist/${func}"
  npx esbuild src/lambdaHandler.ts \
    --bundle \
    --platform=node \
    --target=node22 \
    --format=cjs \
    --outfile="dist/${func}/lambdaHandler.js" \
    --external:aws-sdk \
    --external:@aws-sdk/* \
    "${KNEX_EXTERNALS[@]}" \
    --minify \
    --keep-names
done

# Bundle Migration Runner Lambda
echo "Bundling migrationRunner..."
mkdir -p dist/migrationRunner
npx esbuild src/migrationHandler.ts \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=cjs \
  --outfile=dist/migrationRunner/lambdaHandler.js \
  --external:aws-sdk \
  --external:@aws-sdk/* \
  "${KNEX_EXTERNALS[@]}" \
  --minify \
  --keep-names

# Copy certificate files if they exist
if [ -d "certs" ]; then
    echo "Copying certificate files..."
    for func in initPayment processPayment getDetails testCert getAllTransactions getTransactionsByStatus getTransactionPaymentStatus; do
        if [ -d "dist/$func" ]; then
            cp -r certs dist/$func/
        fi
    done
fi

# Download Amazon RDS CA bundle for TLS certificate verification
echo "Downloading RDS CA bundle..."
curl -sSf -o /tmp/rds-ca-bundle.pem \
  https://truststore.pki.rds.amazonaws.com/us-east-1/us-east-1-bundle.pem

# Copy CA bundle to all Lambda functions that connect to RDS
for func in migrationRunner getAllTransactions getTransactionsByStatus getTransactionPaymentStatus; do
  cp /tmp/rds-ca-bundle.pem "dist/${func}/rds-ca-bundle.pem"
done

# Copy migration and seed files for migrationRunner
echo "Compiling migration files..."
mkdir -p dist/migrationRunner/db/migrations
npx esbuild db/migrations/*.ts \
  --bundle=false \
  --platform=node \
  --target=node22 \
  --format=cjs \
  --outdir=dist/migrationRunner/db/migrations/

echo "Compiling seed files..."
mkdir -p dist/migrationRunner/db/seeds
npx esbuild db/seeds/*.ts \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=cjs \
  --external:knex \
  --outdir=dist/migrationRunner/db/seeds/

echo "Build completed successfully!"
echo "Bundled Lambda functions ready:"
echo "  - dist/initPayment/lambdaHandler.js"
echo "  - dist/processPayment/lambdaHandler.js"
echo "  - dist/getDetails/lambdaHandler.js"
echo "  - dist/testCert/lambdaHandler.js"
echo "  - dist/getAllTransactions/lambdaHandler.js"
echo "  - dist/getTransactionsByStatus/lambdaHandler.js"
echo "  - dist/getTransactionPaymentStatus/lambdaHandler.js"
echo "  - dist/migrationRunner/lambdaHandler.js"

# Show file sizes
echo ""
echo "Bundle sizes:"
for func in initPayment processPayment getDetails testCert getAllTransactions getTransactionsByStatus getTransactionPaymentStatus migrationRunner; do
    if [ -f "dist/$func/lambdaHandler.js" ]; then
        size=$(du -h "dist/$func/lambdaHandler.js" | cut -f1)
        echo "  - $func: $size"
    fi
done
