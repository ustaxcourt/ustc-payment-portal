import type { Knex } from "knex";

/**
 * Fees are now hardcoded in `src/config/fees.ts` (keyed by the stable fee key),
 * so the `fees` table and its FK from `transactions` are no longer needed.
 * Each transaction stores the stable fee key directly in the `fee` column.
 */
export async function up(knex: Knex): Promise<void> {
  // Drop the FK from transactions → fees before renaming the column so the
  // rename does not trip up any dependent constraint.
  await knex.raw(`
    ALTER TABLE transactions
    DROP CONSTRAINT IF EXISTS transactions_fee_id_foreign
  `);

  await knex.schema.alterTable("transactions", (t) => {
    t.renameColumn("fee_id", "fee");
  });

  await knex.raw(
    `COMMENT ON COLUMN transactions.fee IS 'Stable fee key (e.g. PETITION_FILING_FEE)'`,
  );

  await knex.schema.dropTableIfExists("fees");
}

export async function down(knex: Knex): Promise<void> {
  // Recreate the fees table with the shape it had before this migration ran.
  // Data is not restored — callers that need it must re-run the fee-related
  // seeds after rolling back.
  throw new Error(
    "This migration is irreversible: fee configuration has moved permanently into application code.",
  );
}
