import type { Knex } from "knex";
import { generateFees } from "./data/fees";

/**
 * Reference data seed: inserts canonical fee definitions.
 * These values drive core application logic (feeId, tcsAppId).
 * fees.amount is the reference amount used at transaction initiation time —
 * each transaction snapshots it into transaction_amount at creation, so
 * updating a fee's amount here does not affect existing transactions.
 * Safe to run multiple times — upserts to avoid duplicates.
 */
export async function seed(knex: Knex): Promise<void> {
  await knex("fees").insert(generateFees()).onConflict("fee_id").merge();
}
