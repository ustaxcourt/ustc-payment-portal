import type { Knex } from "knex";

const COVERED_STATUSES = "'received', 'initiated', 'processing', 'pending', 'processed'";

type DuplicateGroup = {
  client_name: string;
  transaction_reference_id: string;
  paid_count: string;
};

type SupersededRow = {
  agency_tracking_id: string;
  client_name: string;
  transaction_reference_id: string;
  prior_status: string;
};

// Adds 'processed' to the predicate so at most one paid attempt per obligation is enforceable.
// Pre-existing violations are resolved first, in the same transaction, so data is only rewritten
// if the index also builds. 'failed' stays excluded so declines remain retryable.
export async function up(knex: Knex): Promise<void> {
  const doublePaid = await knex.raw<{ rows: DuplicateGroup[] }>(`
    SELECT client_name, transaction_reference_id, count(*) AS paid_count
    FROM transactions
    WHERE transaction_status IN ('pending', 'processed')
    GROUP BY client_name, transaction_reference_id
    HAVING count(*) > 1
  `);

  if (doublePaid.rows.length > 0) {
    const detail = doublePaid.rows
      .map(
        (row) =>
          `  (${row.client_name}, ${row.transaction_reference_id}) — ${row.paid_count} paid attempts`,
      )
      .join("\n");
    throw new Error(
      `Cannot add 'processed' to idx_transactions_unique_active: ${doublePaid.rows.length} ` +
        "obligation(s) have more than one paid attempt. These are real duplicate payments and " +
        `need to be reconciled (refunded or voided) before this migration can run:\n${detail}`,
    );
  }

  // Retire abandoned non-terminal attempts that were superseded by another attempt for the same
  // obligation. The CTE carries each row's prior status through so the change is auditable after
  // the fact — these rows are rewritten and `down` cannot restore them.
  const superseded = await knex.raw<{ rows: SupersededRow[] }>(`
    WITH candidates AS (
      SELECT t.agency_tracking_id, t.transaction_status AS prior_status
      FROM transactions AS t
      WHERE t.transaction_status IN ('received', 'initiated', 'processing')
        AND EXISTS (
          SELECT 1 FROM transactions AS other
          WHERE other.client_name = t.client_name
            AND other.transaction_reference_id = t.transaction_reference_id
            AND other.agency_tracking_id <> t.agency_tracking_id
            AND other.transaction_status IN (${COVERED_STATUSES})
        )
    )
    UPDATE transactions AS t
    SET transaction_status = 'failed',
        payment_status = 'failed',
        return_code = 5009,
        return_detail = 'Superseded by another attempt for the same obligation'
    FROM candidates AS c
    WHERE t.agency_tracking_id = c.agency_tracking_id
    RETURNING t.agency_tracking_id, t.client_name,
              t.transaction_reference_id, c.prior_status
  `);

  console.log(
    `[20260805000000] retired ${superseded.rows.length} superseded attempt(s) before reindexing`,
  );
  for (const row of superseded.rows) {
    console.log(
      `[20260805000000] ${row.agency_tracking_id} (${row.client_name}, ${row.transaction_reference_id}) ${row.prior_status} -> failed`,
    );
  }

  await knex.schema.raw(`DROP INDEX IF EXISTS idx_transactions_unique_active`);

  await knex.schema.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_unique_active
    ON transactions (client_name, transaction_reference_id)
    WHERE transaction_status IN (${COVERED_STATUSES})
  `);
}

// Reverts the index only — a retired attempt's prior status cannot be re-derived.
export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw(`DROP INDEX IF EXISTS idx_transactions_unique_active`);

  await knex.schema.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_unique_active
    ON transactions (client_name, transaction_reference_id)
    WHERE transaction_status IN ('received', 'initiated', 'processing', 'pending')
  `);
}
