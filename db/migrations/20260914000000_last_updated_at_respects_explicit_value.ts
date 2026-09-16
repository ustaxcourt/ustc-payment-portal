import type { Knex } from "knex";

// Holds last_updated_at on the transition into 'cancelled' so the row stays in the day it was
// attempted — the transaction log and every aggregate window on this column. Lives in the
// trigger because a BEFORE UPDATE cannot tell a self-assignment from an absent column.
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
