import type { Knex } from "knex";
import { Model } from "objection";
import { generateTransactions } from "./data/transactions";

/**
 * Seed volume controls. Adjust for local development and CI.
 *
 *    SEED_START_DATE: Earliest day seeded rows are dated to. Clamped forward to
 *      the earliest fee activation date if it precedes that.
 *    SEED_TOTAL_RECORDS: Total rows to generate, spread as evenly as possible
 *      across every day from SEED_START_DATE to today. Multi-attempt rows count
 *      toward this total.
 *    SEED_MULTI_ATTEMPT_GROUPS: Groups of rows sharing one obligation (a failed
 *      attempt followed by a successful retry).
 */
const SEED_START_DATE = "2025-01-01";
const SEED_TOTAL_RECORDS = 3500;
const SEED_MULTI_ATTEMPT_GROUPS = 10;

/**
 * Dummy data seed: inserts fake-but-realistic transaction records for
 * development and CI.
 */
export async function seed(knex: Knex): Promise<void> {
  Model.knex(knex);
  await knex("transactions").del();
  await knex("transactions").insert(
    await generateTransactions({
      multiAttemptGroups: SEED_MULTI_ATTEMPT_GROUPS,
      startDate: SEED_START_DATE,
      numberOfRecords: SEED_TOTAL_RECORDS,
    }),
  );
}
