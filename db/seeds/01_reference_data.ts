import type { Knex } from "knex";
import { generateFees } from "./data/fees";

/**
 * Reference data seed: inserts canonical fee definitions.
 * These values drive core application logic (feeId, tcsAppId, amounts).
 * Safe to run multiple times — upserts to avoid duplicates.
 */
export async function seed(knex: Knex): Promise<void> {
  await knex("fees").insert(generateFees()).onConflict("fee_id").merge();
}
