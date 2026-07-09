import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.raw(`DROP INDEX IF EXISTS idx_transactions_unique_active`);

  await knex.schema.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_unique_active
    ON transactions (client_name, transaction_reference_id)
    WHERE transaction_status IN ('received', 'initiated', 'processing', 'pending')
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw(`DROP INDEX IF EXISTS idx_transactions_unique_active`);

  await knex.schema.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_unique_active
    ON transactions (client_name, transaction_reference_id)
    WHERE transaction_status IN ('received', 'initiated', 'pending')
  `);
}
