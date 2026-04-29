import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.raw(`
    ALTER TABLE transactions
    DROP CONSTRAINT IF EXISTS idx_transactions_client_ref
  `);

  await knex.schema.raw(`
    DROP INDEX IF EXISTS idx_transactions_client_ref
  `);

  await knex.schema.raw(`
    CREATE INDEX IF NOT EXISTS idx_transactions_client_ref
    ON transactions (client_name, transaction_reference_id)
  `);

  // Partial unique index: at most one in-flight attempt per (client_name, transaction_reference_id).
  // Covers every non-terminal status:
  //   'received'  — TOCTOU race window at initPayment.createReceived (before Pay.gov is called).
  //   'initiated' — token returned by Pay.gov, user redirected, payment not yet submitted.
  //   'pending'   — Pay.gov is still processing (e.g., ACH awaiting settlement); status will
  //                 resolve to 'processed' or 'failed' on the next refresh.
  // Only terminal statuses ('processed', 'failed') are excluded — failed attempts can be retried
  // and successful attempts coexist alongside prior failures in the historical record.
  await knex.schema.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_unique_active
    ON transactions (client_name, transaction_reference_id)
    WHERE transaction_status IN ('received', 'initiated', 'pending')
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw(`DROP INDEX IF EXISTS idx_transactions_unique_active`);

  await knex.schema.raw(`DROP INDEX IF EXISTS idx_transactions_client_ref`);

  await knex.schema.raw(`
    ALTER TABLE transactions
    ADD CONSTRAINT idx_transactions_client_ref
    UNIQUE (client_name, transaction_reference_id)
  `);
}
