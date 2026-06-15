import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Restore transaction_amount as a snapshot of the fee amount at initPayment time.
  // Fees are now hardcoded in src/fees.ts; the fees table FK is being dropped.
  await knex.schema.alterTable('transactions', (t) => {
    t.decimal('transaction_amount', 12, 2).nullable().comment('Fee amount snapshotted at transaction initiation time (USD)');
  });

  // Backfill from the fees table before dropping it
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

  // Drop the FK constraint from transactions to fees
  await knex.raw(`
    ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_fee_id_foreign
  `);

  // Drop fee versioning constraints and indexes before dropping the table
  await knex.raw(`
    ALTER TABLE fees DROP CONSTRAINT IF EXISTS fees_fee_key_activation_date_unique
  `);
  await knex.schema.alterTable('fees', (t) => {
    t.dropIndex(['fee_key'], 'idx_fees_fee_key');
    t.dropIndex(['tcs_app_id'], 'idx_fees_tcs_app_id');
    t.dropIndex(['is_variable'], 'idx_fees_is_variable');
  });

  await knex.schema.dropTable('fees');
}

export async function down(knex: Knex): Promise<void> {
  // Recreate the fees table
  await knex.schema.createTable('fees', (t) => {
    t.string('fee_id', 100).primary().comment('Fee Identifier');
    t.string('fee_key', 100).notNullable().comment('Stable client-facing identifier, shared across all versions of this fee');
    t.string('name', 255).notNullable().comment('Fee Name');
    t.string('tcs_app_id', 21).notNullable().comment('TCS Application ID');
    t.boolean('is_variable').notNullable().defaultTo(false).comment('Whether the fee amount is variable');
    t.decimal('amount', 12, 2).nullable().comment('Fee Amount (USD), null if is_variable=true');
    t.text('description').nullable().comment('Fee Description');
    t.timestamp('activation_date', { useTz: true }).notNullable().comment('When this fee version becomes active');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.alterTable('fees', (t) => {
    t.index(['fee_key'], 'idx_fees_fee_key');
    t.index(['tcs_app_id'], 'idx_fees_tcs_app_id');
    t.index(['is_variable'], 'idx_fees_is_variable');
  });

  await knex.raw(`
    ALTER TABLE fees
    ADD CONSTRAINT fees_fee_key_activation_date_unique
    UNIQUE (fee_key, activation_date)
  `);

  await knex.raw(`
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_fee_id_foreign
      FOREIGN KEY (fee_id) REFERENCES fees(fee_id)
      ON DELETE RESTRICT
      NOT VALID
  `);

  // Remove transaction_amount (it was derived from the fees join before this migration)
  await knex.schema.raw(`
    ALTER TABLE transactions
    DROP CONSTRAINT IF EXISTS transactions_transaction_amount_nonneg
  `);

  await knex.schema.alterTable('transactions', (t) => {
    t.dropColumn('transaction_amount');
  });
}
