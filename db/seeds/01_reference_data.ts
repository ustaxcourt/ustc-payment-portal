import type { Knex } from "knex";
import { generateFees } from "./data/fees";

/**
 * Reference data seed: inserts canonical fee definitions.
 * These values drive core application logic (feeId, tcsAppId).
 * fees.amount is the reference amount used at transaction initiation time —
 * each transaction snapshots it into transaction_amount at creation, so
 * updating a fee's amount here does not affect existing transactions.
 *
 * To add a new fee or update an existing one, edit generateFees() in
 * ./data/fees.ts and re-run seed:run. The upsert on fee_id means existing
 * fees are updated in place and new ones are inserted.
 */
export async function seed(knex: Knex): Promise<void> {
  await knex("fees").insert(generateFees()).onConflict("fee_id").merge();
}
