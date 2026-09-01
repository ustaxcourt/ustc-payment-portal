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
const SEED_START_DATE = "2025-01-01";
const NUMBER_OF_RECORDS = 3500;
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
      numberOfRecords: NUMBER_OF_RECORDS,
    }),
  );
}
