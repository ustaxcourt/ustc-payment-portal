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
npx esbuild src/lambdas/initPayment.ts \
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
npx esbuild src/lambdas/processPayment.ts \
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
npx esbuild src/lambdas/getDetails.ts \
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
npx esbuild src/lambdas/testCert.ts \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=cjs \
  --outfile=dist/testCert/lambdaHandler.js \
  --external:aws-sdk \
  --external:@aws-sdk/* \
  --minify \
  --keep-names

# Copy certificate files if they exist
if [ -d "certs" ]; then
    echo "Copying certificate files..."
    for func in initPayment processPayment getDetails testCert; do
        if [ -d "dist/$func" ]; then
            cp -r certs dist/$func/
        fi
    done
fi

echo "Build completed successfully!"
echo "Bundled Lambda functions ready:"
echo "  - dist/initPayment/lambdaHandler.js"
echo "  - dist/processPayment/lambdaHandler.js"
echo "  - dist/getDetails/lambdaHandler.js"
echo "  - dist/testCert/lambdaHandler.js"

# Show file sizes
echo ""
echo "Bundle sizes:"
for func in initPayment processPayment getDetails testCert; do
    if [ -f "dist/$func/lambdaHandler.js" ]; then
        size=$(du -h "dist/$func/lambdaHandler.js" | cut -f1)
        echo "  - $func: $size"
    fi
done
