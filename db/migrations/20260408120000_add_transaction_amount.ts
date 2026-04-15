import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add nullable first so existing rows can be backfilled before enforcing NOT NULL
  await knex.schema.alterTable('transactions', (t) => {
    t.decimal('transaction_amount', 12, 2).nullable().comment('Actual amount charged for this transaction (USD)');
  });

  // Backfill using known fee amounts at the time this migration was written.
  // We cannot join fees here because that table is seeded after migrations run.
  // These are the canonical fixed amounts for all transactions created before
  // this column was added — correct by definition for historical rows.
  await knex.raw(`
    UPDATE transactions
    SET transaction_amount = CASE fee_id
      WHEN 'PETITION_FILING_FEE'               THEN 60.00
      WHEN 'NONATTORNEY_EXAM_REGISTRATION_FEE' THEN 250.00
    END
    WHERE transaction_amount IS NULL
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
