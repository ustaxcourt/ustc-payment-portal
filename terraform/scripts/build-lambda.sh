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
  --external:mariadb
  --external:mariadb/callback
  --external:tedious
  --external:pg-query-stream
  --external:better-sqlite3
  --external:oracledb
)

# Bundle Init Payment Lambda
echo "Bundling initPayment..."
mkdir -p dist/initPayment
npx esbuild src/handlers/initPaymentHandler.ts \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=cjs \
  --outfile=dist/initPayment/initPaymentHandler.js \
  --external:aws-sdk \
  --external:@aws-sdk/* \
  "${KNEX_EXTERNALS[@]}" \
  --minify \
  --keep-names

# Bundle Process Payment Lambda
echo "Bundling processPayment..."
mkdir -p dist/processPayment
npx esbuild src/handlers/processPaymentHandler.ts \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=cjs \
  --outfile=dist/processPayment/processPaymentHandler.js \
  --external:aws-sdk \
  --external:@aws-sdk/* \
  "${KNEX_EXTERNALS[@]}" \
  --minify \
  --keep-names

# Bundle Get Details Lambda
echo "Bundling getDetails..."
mkdir -p dist/getDetails
npx esbuild src/handlers/getDetailsHandler.ts \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=cjs \
  --outfile=dist/getDetails/getDetailsHandler.js \
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
  "${KNEX_EXTERNALS[@]}" \
  --minify \
  --keep-names

# Bundle getAllTransactions Lambda
echo "Bundling getAllTransactions..."
mkdir -p dist/getAllTransactions
npx esbuild src/handlers/getAllTransactionsHandler.ts \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=cjs \
  --outfile=dist/getAllTransactions/getAllTransactionsHandler.js \
  --external:aws-sdk \
  --external:@aws-sdk/* \
  "${KNEX_EXTERNALS[@]}" \
  --minify \
  --keep-names

# Bundle getTransactionsByStatus Lambda
echo "Bundling getTransactionsByStatus..."
mkdir -p dist/getTransactionsByStatus
npx esbuild src/handlers/getTransactionsByStatusHandler.ts \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=cjs \
  --outfile=dist/getTransactionsByStatus/getTransactionsByStatusHandler.js \
  --external:aws-sdk \
  --external:@aws-sdk/* \
  "${KNEX_EXTERNALS[@]}" \
  --minify \
  --keep-names

# Bundle getTransactionPaymentStatus Lambda
echo "Bundling getTransactionPaymentStatus..."
mkdir -p dist/getTransactionPaymentStatus
npx esbuild src/handlers/getTransactionPaymentStatusHandler.ts \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=cjs \
  --outfile=dist/getTransactionPaymentStatus/getTransactionPaymentStatusHandler.js \
  --external:aws-sdk \
  --external:@aws-sdk/* \
  "${KNEX_EXTERNALS[@]}" \
  --minify \
  --keep-names

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

# Global bundle (not regional) so all-region RDS CAs are covered.
echo "Downloading RDS CA bundle..."
curl -sSf -o /tmp/rds-ca-bundle.pem \
  https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem

# Copy CA bundle to all Lambda functions that connect to RDS (testCert included:
# its bundle is reused by healthCheck, whose RDS check must validate the CA).
for func in initPayment processPayment getDetails testCert migrationRunner getAllTransactions getTransactionsByStatus getTransactionPaymentStatus; do
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
  "${KNEX_EXTERNALS[@]}" \
  --outdir=dist/migrationRunner/db/seeds/

echo "Build completed successfully!"
echo "Bundled Lambda functions ready:"
echo "  - dist/initPayment/initPaymentHandler.js"
echo "  - dist/processPayment/processPaymentHandler.js"
echo "  - dist/getDetails/getDetailsHandler.js"
echo "  - dist/testCert/lambdaHandler.js"
echo "  - dist/getAllTransactions/getAllTransactionsHandler.js"
echo "  - dist/getTransactionsByStatus/getTransactionsByStatusHandler.js"
echo "  - dist/getTransactionPaymentStatus/getTransactionPaymentStatusHandler.js"
echo "  - dist/migrationRunner/lambdaHandler.js"

# Show file sizes
echo ""
echo "Bundle sizes:"
for func in initPayment processPayment getDetails testCert getAllTransactions getTransactionsByStatus getTransactionPaymentStatus migrationRunner; do
  output_file="lambdaHandler.js"
  if [ "$func" = "initPayment" ]; then
    output_file="initPaymentHandler.js"
  elif [ "$func" = "processPayment" ]; then
    output_file="processPaymentHandler.js"
  elif [ "$func" = "getDetails" ]; then
    output_file="getDetailsHandler.js"
  elif [ "$func" = "getAllTransactions" ]; then
    output_file="getAllTransactionsHandler.js"
  elif [ "$func" = "getTransactionsByStatus" ]; then
    output_file="getTransactionsByStatusHandler.js"
  elif [ "$func" = "getTransactionPaymentStatus" ]; then
    output_file="getTransactionPaymentStatusHandler.js"
  fi

  if [ -f "dist/$func/$output_file" ]; then
    size=$(du -h "dist/$func/$output_file" | cut -f1)
    echo "  - $func: $size"
    fi
done
