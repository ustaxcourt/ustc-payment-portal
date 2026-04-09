import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("transactions", (t) => {
    t.string("paygov_token", 36).nullable().alter();
  });

  await knex.schema.alterTable("transactions", (t) => {
    // Stores the actual amount charged for this transaction. For fixed fees
    // this equals fees.amount at initiation time; for variable fees this is
    // the caller-supplied amount. Sourcing from here avoids NULL for variable
    // fees and preserves the historical amount if the fee record changes later.
    t.decimal("transaction_amount", 12, 2).notNullable().comment("Actual amount charged for this transaction (USD)");
  });

  await knex.schema.raw(`
    ALTER TABLE transactions
    ADD CONSTRAINT transactions_transaction_amount_nonneg
    CHECK (transaction_amount >= 0)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw(`
    ALTER TABLE transactions
    DROP CONSTRAINT IF EXISTS transactions_transaction_amount_nonneg
  `);
  await knex.schema.alterTable("transactions", (t) => {
    t.dropColumn("transaction_amount");
  });

  await knex.schema.alterTable("transactions", (t) => {
    t.string("paygov_token", 32).nullable().alter();
  });
}
