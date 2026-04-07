import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('transactions', (t) => {
    // Primary key (from Transaction.agencyTrackingId)
    t.string('agency_tracking_id', 21).primary().comment('Agency Tracking ID');
    t.string('paygov_tracking_id', 21).nullable().comment('Pay.gov Tracking ID (optional)');
    t.string('transaction_reference_id', 36).notNullable().comment('Transaction Reference ID');
    t.string('fee_name', 255).notNullable().comment('Fee Name');
    t.string('fee_id', 100).notNullable().comment('Fee Identifier');
    t.decimal('fee_amount', 12, 2).notNullable().comment('Fee Amount (USD)');
    t.string('client_name', 100).notNullable().comment('App/Client Name');
    t.string('payment_status', 50).notNullable().comment('Payment Status');
    t.string('transaction_status', 50).nullable().comment('Transaction Status');
    t.string('payment_method', 50).nullable().comment('Payment Method');
    t.string('paygov_token', 36).nullable().comment('Pay.gov Token (optional)');
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

  // Indexes for common filters & sorting
  await knex.schema.alterTable('transactions', (t) => {
    t.index(['payment_status'], 'idx_transactions_payment_status');
    t.index(['transaction_status'], 'idx_transactions_transaction_status');
    t.index(['client_name'], 'idx_transactions_client_name');
    t.index(['paygov_tracking_id'], 'idx_transactions_paygov_tracking_id');
    t.index(['paygov_token'], 'idx_transactions_paygov_token');
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

  // Trigger: auto-update last_updated_at on every UPDATE
  await knex.schema.raw(`
    CREATE OR REPLACE FUNCTION set_last_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.last_updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await knex.schema.raw(`
    CREATE TRIGGER trg_transactions_last_updated_at
    BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE PROCEDURE set_last_updated_at()
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw('DROP TRIGGER IF EXISTS trg_transactions_last_updated_at ON transactions');
  await knex.schema.raw('DROP FUNCTION IF EXISTS set_last_updated_at()');
  await knex.schema.dropTableIfExists('transactions');
}
