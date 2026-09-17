import type { Knex } from "knex";

type CancelledRow = {
  agency_tracking_id: string;
  client_name: string;
  transaction_reference_id: string;
};

// Literal, not MAX_TOKEN_AGE_MS: a migration must not change meaning if that constant moves.
const TOKEN_TTL = "3 hours";

// Clears the backlog stuck at 'initiated'. Must run after 20260914000000, or every row
// below re-dates to the deploy.
export async function up(knex: Knex): Promise<void> {
  const cancelled = await knex.raw<{ rows: CancelledRow[] }>(`
    UPDATE transactions
       SET transaction_status = 'cancelled',
           payment_status = 'failed'
     WHERE transaction_status = 'initiated'
       AND created_at < now() - interval '${TOKEN_TTL}'
    RETURNING agency_tracking_id, client_name, transaction_reference_id
  `);

  console.log(
    `[20260915000000] cancelled ${cancelled.rows.length} abandoned attempt(s)`,
  );
  for (const row of cancelled.rows) {
    console.log(
      `[20260915000000] ${row.agency_tracking_id} (${row.client_name}, ${row.transaction_reference_id}) initiated -> cancelled`,
    );
  }
}

// Best-effort and lossy: rows the sweeper cancelled later are reverted too, and the trigger
// stamps NOW() on the way back, so preserved timestamps do not survive a round trip. Rows whose
// obligation gained another active attempt are skipped — they would violate the unique index.
export async function down(knex: Knex): Promise<void> {
  const restored = await knex.raw<{ rows: { agency_tracking_id: string }[] }>(`
    UPDATE transactions AS t
       SET transaction_status = 'initiated',
           payment_status = 'pending'
     WHERE t.transaction_status = 'cancelled'
       AND t.return_code IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM transactions AS other
          WHERE other.client_name = t.client_name
            AND other.transaction_reference_id = t.transaction_reference_id
            AND other.agency_tracking_id <> t.agency_tracking_id
            AND other.transaction_status IN
                ('received', 'initiated', 'processing', 'pending', 'processed')
       )
    RETURNING t.agency_tracking_id
  `);

  console.log(
    `[20260915000000] restored ${restored.rows.length} attempt(s) to initiated`,
  );
}
