import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('fees', (t) => {
    t.string('fee_id', 100).primary().comment('Fee Identifier');
    t.string('name', 255).notNullable().comment('Fee Name');
    t.string('tcs_app_id', 21).notNullable().comment('TCS Application ID');
    t.boolean('is_variable').notNullable().defaultTo(false).comment('Whether the fee amount is variable');
    t.decimal('amount', 12, 2).nullable().comment('Fee Amount (USD), null if is_variable=true');
    t.text('description').nullable().comment('Fee Description');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // Indexes
  await knex.schema.alterTable('fees', (t) => {
    t.index(['tcs_app_id'], 'idx_fees_tcs_app_id');
    t.index(['is_variable'], 'idx_fees_is_variable');
  });

  // Make payment_method nullable
  await knex.schema.alterTable('transactions', (t) => {
    t.string('payment_method', 50).nullable().alter();
  });

  // Add FK as NOT VALID so Postgres skips checking existing rows.
  // Existing transactions have valid fee_ids, but the fees table is empty
  // at migration time — 01_reference_data seeds fees immediately after.
  // A subsequent migration validates the constraint once the data is present.
  await knex.raw(`
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_fee_id_foreign
      FOREIGN KEY (fee_id) REFERENCES fees(fee_id)
      ON DELETE RESTRICT
      NOT VALID
  `);

  // Remove fee_name and fee_amount from transactions
  await knex.schema.alterTable('transactions', (t) => {
    t.dropColumn('fee_name');
    t.dropColumn('fee_amount');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('transactions', (t) => {
    t.string('fee_name', 255).nullable().comment('Fee Name');
    t.decimal('fee_amount', 12, 2).nullable().comment('Fee Amount (USD)');
  });

  await knex.raw(`
    UPDATE transactions t
    SET
      fee_name = f.name,
      fee_amount = f.amount
    FROM fees f
    WHERE t.fee_id = f.fee_id
  `);

  await knex.raw(`
    UPDATE transactions
    SET payment_method = ''
    WHERE payment_method IS NULL
  `);
  await knex.schema.alterTable('transactions', (t) => {
    t.string('payment_method', 50).notNullable().alter();
  });

  await knex.schema.alterTable('transactions', (t) => {
    t.dropForeign(['fee_id']);
  });

  await knex.schema.dropTableIfExists('fees');
}
