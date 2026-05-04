import type { Knex } from "knex";
import { Model } from "objection";
import { generateTransactions } from "./data/transactions";


/**
 * Set the number of each transaction type to seed. Adjust as needed for local development and CI.
 * Requires reference data (fees) to already be present in the DB.
 * 
 *    SEED_SUCCESS_TRANSACTIONS: Number of successful transactions to seed.
 *    SEED_FAILED_TRANSACTIONS: Number of failed transactions to seed.
 *    SEED_PENDING_TRANSACTIONS: Number of pending transactions to seed.
 *    SEED_MULTI_ATTEMPT_GROUPS: Number of groups of transactions with multiple attempts (e.g. a failed attempt followed by a successful retry).
 */
const SEED_SUCCESS_TRANSACTIONS = 200;
const SEED_FAILED_TRANSACTIONS = 50;
const SEED_PENDING_TRANSACTIONS = 20;
const SEED_MULTI_ATTEMPT_GROUPS = 10;

/**
 * Dummy data seed: inserts fake-but-realistic transaction records for
 * development and CI. Requires reference data (fees) to already be present.
 */
export async function seed(knex: Knex): Promise<void> {
  Model.knex(knex);
  await knex("transactions").del();
  await knex("transactions").insert(
    await generateTransactions({
      successTransactions: SEED_SUCCESS_TRANSACTIONS,
      failedTransactions: SEED_FAILED_TRANSACTIONS,
      pendingTransactions: SEED_PENDING_TRANSACTIONS,
      multiAttemptGroups: SEED_MULTI_ATTEMPT_GROUPS,
    }),
  );
}

