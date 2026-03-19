import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('transactions', (t) => {
    // Primary key (from Transaction.agencyTrackingId)
    t.string('agency_tracking_id', 100).primary().comment('Agency Tracking ID');
    t.string('paygov_tracking_id', 100).nullable().comment('Pay.gov Tracking ID (optional)');
    t.string('transaction_reference_id', 255).notNullable().comment('Transaction Reference ID');
    t.string('fee_name', 255).notNullable().comment('Fee Name');
    t.string('fee_id', 100).notNullable().comment('Fee Identifier');
    t.decimal('fee_amount', 12, 2).notNullable().comment('Fee Amount (USD)');
    t.string('client_name', 100).notNullable().comment('App/Client Name');
    t.string('payment_status', 50).notNullable().comment('Payment Status');
    t.string('transaction_status', 50).nullable().comment('Transaction Status');
    t.string('payment_method', 50).notNullable().comment('Payment Method');
    t.text('paygov_token').nullable().comment('Pay.gov Token (optional)');
    t.jsonb('metadata').nullable().comment('Free-form metadata bag');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('last_updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(['client_name', 'transaction_reference_id'], 'idx_transactions_client_ref');
  });

  // Constraints
  await knex.schema.raw(`
    ALTER TABLE transactions
    ADD CONSTRAINT transactions_fee_amount_nonneg
    CHECK (fee_amount >= 0)
  `);
  await knex.schema.raw(`
    ALTER TABLE transactions
    ADD CONSTRAINT transactions_payment_status_valid
    CHECK (payment_status IN ('pending', 'success', 'failed'))
  `);
  await knex.schema.raw(`
    ALTER TABLE transactions
    ADD CONSTRAINT transactions_transaction_status_valid
    CHECK (
      transaction_status IS NULL OR
      transaction_status IN ('received', 'initiated', 'pending', 'processed', 'failed')
    )
  `);
  await knex.schema.raw(`
    ALTER TABLE transactions
    ADD CONSTRAINT transactions_payment_method_valid
    CHECK (payment_method IN ('plastic_card', 'ach', 'paypal'))
  `);

  // Indexes for common filters & sorting
  await knex.schema.alterTable('transactions', (t) => {
    t.index(['payment_status'], 'idx_transactions_payment_status');
    t.index(['transaction_status'], 'idx_transactions_transaction_status');
    t.index(['client_name'], 'idx_transactions_client_name');
    t.index(['paygov_tracking_id'], 'idx_transactions_paygov_tracking_id');
  });

  // DESC indexes for time-based queries
  await knex.schema.raw(`
    CREATE INDEX IF NOT EXISTS idx_transactions_created_at
    ON transactions (created_at DESC)
  `);
  await knex.schema.raw(`
    CREATE INDEX IF NOT EXISTS idx_transactions_last_updated_at
    ON transactions (last_updated_at DESC)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('transactions');
}
