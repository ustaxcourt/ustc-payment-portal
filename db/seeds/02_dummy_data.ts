import type { Knex } from "knex";
import { Model } from "objection";
import { generateTransactions } from "./data/transactions";

/**
 * Seed controls for local development and CI.
 *
 *    SEED_START_DATE: Inclusive lower bound for generated transaction dates.
 *    NUMBER_OF_RECORDS: Total number of transaction rows to generate.
 *    SEED_MULTI_ATTEMPT_GROUPS: Number of groups of transactions with multiple attempts (e.g. a failed attempt followed by a successful retry).
 */
const SEED_START_DATE = "2024-10-01";
const NUMBER_OF_RECORDS = 3500;
const SEED_MULTI_ATTEMPT_GROUPS = 10;

/**
 * Dummy data seed: inserts fake-but-realistic transaction records for
 * development and CI.
 */
export async function seed(knex: Knex): Promise<void> {
  console.log("02_dummy_data seed started");
  Model.knex(knex);
  await knex("transactions").del();
  const rows = await generateTransactions({
    multiAttemptGroups: SEED_MULTI_ATTEMPT_GROUPS,
    startDate: SEED_START_DATE,
    numberOfRecords: NUMBER_OF_RECORDS,
  });

  console.log(`Generated ${rows.length} rows`);
  await knex("transactions").insert(rows);
  console.log("02_dummy_data seed completed");
}
