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
  await knex.schema.createTable("fees", (t) => {
    t.string("fee_id", 100).primary().comment("Fee Identifier");
    t.string("fee_key", 100)
      .notNullable()
      .comment(
        "Stable client-facing identifier, shared across all versions of this fee",
      );
    t.string("name").notNullable();
    t.string("tcs_app_id").notNullable();
    t.boolean("is_variable").notNullable().defaultTo(false);
    t.decimal("amount", 12, 2).nullable();
    t.text("description").nullable();
    t.timestamp("activation_date", { useTz: true })
      .notNullable()
      .comment("When this fee version becomes active");
    t.timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    t.index(["fee_key"], "idx_fees_fee_key");
  });

  await knex.raw(`
    ALTER TABLE fees
    ADD CONSTRAINT fees_fee_key_activation_date_unique
    UNIQUE (fee_key, activation_date)
  `);

  await knex.schema.alterTable("transactions", (t) => {
    t.renameColumn("fee", "fee_id");
  });

  await knex.raw(`
    ALTER TABLE transactions
    ADD CONSTRAINT transactions_fee_id_foreign
    FOREIGN KEY (fee_id) REFERENCES fees(fee_id) NOT VALID
  `);
}
