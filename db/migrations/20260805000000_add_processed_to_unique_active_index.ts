import type { Knex } from "knex";

// adds 'processed' to the predicate so the index enforces "at most one paid attempt
// per obligation". Previously 'processed' was outside the predicate, leaving a TOCTOU window
// where a concurrent processPayment could finalize between initPayment's guard and its insert.
// 'failed' stays excluded so declined attempts can still be retried.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.raw(`DROP INDEX IF EXISTS idx_transactions_unique_active`);

  await knex.schema.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_unique_active
    ON transactions (client_name, transaction_reference_id)
    WHERE transaction_status IN ('received', 'initiated', 'processing', 'pending', 'processed')
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw(`DROP INDEX IF EXISTS idx_transactions_unique_active`);

  await knex.schema.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_unique_active
    ON transactions (client_name, transaction_reference_id)
    WHERE transaction_status IN ('received', 'initiated', 'processing', 'pending')
  `);
}
