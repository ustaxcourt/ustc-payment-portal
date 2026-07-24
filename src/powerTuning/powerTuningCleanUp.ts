import { getKnex } from "../db/knex";

type PowerTuningCleanUpEvent = {
  preserveReferenceIds?: string[];
};

type PowerTuningCleanUpResult = {
  statusCode: number;
  body: string;
};

/**
 * Deletes transactions created by Lambda Power Tuning runs — tagged
 * metadata.docketNumber = "power-tuning" by src/powerTuning/fixtures/*.json
 * and processTokenMinter.ts — except any reference IDs the caller asks to
 * keep (e.g. the one seeded transaction the getDetails fixture depends on).
 *
 * DEV-ONLY: deployed only in the real `dev` workspace (see
 * terraform/environments/dev/power-tuning-preprocessors.tf), invoked directly
 * by .github/workflows/power-tuning-dev.yml after each tuning run. Kept as
 * its own dedicated Lambda rather than a command on migrationRunner so this
 * dev-only cleanup can never run against the migrationRunner Lambda that
 * also handles real DDL migrations in staging and prod.
 */
export const powerTuningCleanUp = async (
  event?: PowerTuningCleanUpEvent,
): Promise<PowerTuningCleanUpResult> => {
  const preserveReferenceIds = event?.preserveReferenceIds;
  if (!preserveReferenceIds?.length) {
    throw new Error(
      "powerTuningCleanUp requires a non-empty preserveReferenceIds array — omitting it risks deleting fixture-dependent rows",
    );
  }

  const knex = await getKnex();
  const placeholders = preserveReferenceIds.map(() => "?").join(", ");
  const result = await knex.raw<{
    rows: { transaction_reference_id: string }[];
  }>(
    `DELETE FROM transactions
     WHERE metadata->>'docketNumber' = ?
       AND transaction_reference_id NOT IN (${placeholders})
     RETURNING transaction_reference_id`,
    ["power-tuning", ...preserveReferenceIds],
  );

  console.log(`[powerTuningCleanUp] deleted ${result.rows.length} rows`);
  return {
    statusCode: 200,
    body: JSON.stringify({ deletedCount: result.rows.length }),
  };
};

/**
 * Lambda entry point. Named `handler` so the Terraform handler string is
 * `powerTuningCleanUp.handler`.
 */
export const handler = powerTuningCleanUp;
