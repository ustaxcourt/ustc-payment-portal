import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add nullable first so existing rows can be backfilled before enforcing NOT NULL
  await knex.schema.alterTable('transactions', (t) => {
    t.decimal('transaction_amount', 12, 2).nullable().comment('Actual amount charged for this transaction (USD)');
  });

  // Backfill from the fees table — all existing transactions reference a fixed fee
  await knex.raw(`
    UPDATE transactions t
    SET transaction_amount = f.amount
    FROM fees f
    WHERE t.fee_id = f.fee_id
  `);

  await knex.schema.alterTable('transactions', (t) => {
    t.decimal('transaction_amount', 12, 2).notNullable().alter();
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

  await knex.schema.alterTable('transactions', (t) => {
    t.dropColumn('transaction_amount');
  });
}
