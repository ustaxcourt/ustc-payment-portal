import type { Knex } from "knex";

// Holds last_updated_at still on the transition into 'cancelled'. An abandoned attempt is a
// bookkeeping correction, not an event, so it must stay in the day it was attempted — the
// transaction log and every aggregate window on this column.
//
// The rule lives here rather than at the call site because a BEFORE UPDATE trigger cannot tell
// "caller set the column to its own value" from "caller never mentioned it": both leave
// NEW.last_updated_at = OLD.last_updated_at. Every other update still advances the column.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.raw(`
    CREATE OR REPLACE FUNCTION set_last_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.transaction_status IS NOT DISTINCT FROM 'cancelled'
         AND OLD.transaction_status IS DISTINCT FROM 'cancelled' THEN
        RETURN NEW;
      END IF;
      NEW.last_updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw(`
    CREATE OR REPLACE FUNCTION set_last_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.last_updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
}
