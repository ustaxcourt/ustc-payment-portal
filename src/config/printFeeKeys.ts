#!/usr/bin/env ts-node
/* istanbul ignore file -- stdout wrapper around staticFees; the resolution logic it feeds is unit-tested in fees.test.ts. */
/**
 * Prints every configured fee key as a JSON array.
 * Run with: npm run --silent print:fee-keys
 *
 */

import { staticFees } from "./fees";

console.log(JSON.stringify(Object.keys(staticFees)));
