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
  --external:sqlite3 \
  --external:mysql \
  --external:mysql2 \
  --external:tedious \
  --external:pg-query-stream \
  --external:better-sqlite3 \
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

# Copy migration files for migrationRunner
echo "Copying migration files..."
mkdir -p dist/migrationRunner/db/migrations
cp -r db/migrations/. dist/migrationRunner/db/migrations/

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
