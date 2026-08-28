import type { Knex } from "knex";
import { Model } from "objection";
import { generateTransactions } from "./data/transactions";

/**
 * Set the number of each transaction type to seed. Adjust as needed for local development and CI.
 *
 *    SEED_SUCCESS_TRANSACTIONS: Number of successful transactions to seed.
 *    SEED_FAILED_TRANSACTIONS: Number of failed transactions to seed.
 *    SEED_PENDING_TRANSACTIONS: Number of pending transactions to seed.
 *    SEED_MULTI_ATTEMPT_GROUPS: Number of groups of transactions with multiple attempts (e.g. a failed attempt followed by a successful retry).
 */
const SEED_START_DATE = process.env.SEED_START_DATE ?? "2025-01-01";
const NUMBER_OF_RECORDS = process.env.NUMBER_OF_RECORDS ?? "3500";
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
      numberOfRecords: Number(NUMBER_OF_RECORDS),
    }),
  );
}
