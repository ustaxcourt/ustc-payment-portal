/**
 * This file is the home for business-logic constants shared across multiple modules.
 * Keep values here stable and well-documented.
 */

export const MAX_TOKEN_AGE_MS = 10800000; // 3 Hours in MS, Token TTL per Pay.gov Documentation

// Rows cancelled per sweep run. Bounded so the sweeper never holds row locks long enough to
// matter to a live POST /process, which takes them with NOWAIT. Any excess waits for the
// next scheduled run.
export const CANCEL_SWEEP_BATCH_SIZE = 500;
