import type { Knex } from "knex";
import { Model } from "objection";
import { generateTransactions } from "./data/transactions";

/**
 * Dummy data seed: inserts fake-but-realistic transaction records for
 * development and CI. Requires reference data (fees) to already be present.
 */
export async function seed(knex: Knex): Promise<void> {
  Model.knex(knex);
  await knex("transactions").del();

  await knex("transactions").insert(
    await generateTransactions({
      successTransactions: 200,
      failedTransactions: 50,
      pendingTransactions: 20,
      multiAttemptGroups: 10,
    }),
  );
}
