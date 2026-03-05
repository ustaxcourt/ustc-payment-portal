import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create table
  await knex.schema.createTable('transactions', (t) => {
    t.uuid('id').primary();

    t.string('client_app', 100).notNullable();
    t.string('external_reference_id', 255).notNullable();
    t.string('fee_code', 100).notNullable();

    t.integer('amount_cents').notNullable();

    t.string('currency', 10).notNullable().defaultTo('USD');
    t.string('status', 50).notNullable();

    // TIMESTAMPTZ columns with defaults
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // Unique composite index: client_app + external_reference_id
    t.unique(['client_app', 'external_reference_id'], 'idx_transactions_client_app_external_ref');
  });

  // Check constraint: amount_cents >= 0
  await knex.schema.raw(
    `ALTER TABLE transactions
     ADD CONSTRAINT transactions_amount_cents_nonneg
     CHECK (amount_cents >= 0);`
  );

  // Index on status
  await knex.schema.alterTable('transactions', (t) => {
    t.index(['status'], 'idx_transactions_status');
    t.index(['client_app'], 'idx_transactions_client_app');
  });

  // DESC index on created_at (Knex doesn't expose DESC in builder)
  await knex.schema.raw(
    `CREATE INDEX IF NOT EXISTS idx_transactions_created_at
     ON transactions (created_at DESC);`
  );
}

export async function down(knex: Knex): Promise<void> {
  // Dropping the table will also drop all indexes and constraints
  await knex.schema.dropTableIfExists('transactions');
}
