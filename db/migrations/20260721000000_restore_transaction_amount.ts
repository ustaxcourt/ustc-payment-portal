import type { Knex } from "knex";

/** Restores transaction_amount after fee amounts moved into application code. */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("transactions", (table) => {
    table
      .decimal("transaction_amount", 12, 2)
      .nullable()
      .comment("Actual amount charged for this transaction (USD)");
  });

  // The fees table no longer exists at this point. Snapshot the canonical
  // fixed amounts for transaction rows created before this migration.
  await knex.raw(`
    UPDATE transactions
    SET transaction_amount = CASE fee
      WHEN 'PETITION_FILING_FEE'               THEN 60.00
      WHEN 'NONATTORNEY_EXAM_REGISTRATION_FEE' THEN 250.00
    END
  `);

  await knex.schema.alterTable("transactions", (table) => {
    table.decimal("transaction_amount", 12, 2).notNullable().alter();
  });

  await knex.raw(`
    ALTER TABLE transactions
    ADD CONSTRAINT transactions_transaction_amount_nonneg
    CHECK (transaction_amount >= 0)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE transactions
    DROP CONSTRAINT IF EXISTS transactions_transaction_amount_nonneg
  `);

  await knex.schema.alterTable("transactions", (table) => {
    table.dropColumn("transaction_amount");
  });
}