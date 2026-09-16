/**
 * This file is the home for business-logic constants shared across multiple modules.
 * Keep values here stable and well-documented.
 */

export const MAX_TOKEN_AGE_MS = 10800000; // 3 Hours in MS, Token TTL per Pay.gov Documentation

// Max batch size for a transaction cancel sweep job. Any excess waits for the next run.
export const CANCEL_SWEEP_BATCH_SIZE = 500;
