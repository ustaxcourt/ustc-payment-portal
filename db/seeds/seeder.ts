import type { Knex } from 'knex';
import { Model } from 'objection';
import { generateFees } from './data/fees';
import { generateTransactions } from './data/transactions';
import FeesModel from '../../src/db/FeesModel';

/**
 * Seed: Inserts baseline 200 fake-but-realistic transaction records.
 */
export async function seed(knex: Knex): Promise<void> {
    Model.knex(knex);
    // Clear out previous data
    await knex('transactions').del();
    await knex('fees').del();

    await knex('fees').insert(generateFees());
    await knex('transactions').insert(await generateTransactions({
        successTransactions: 200,
        failedTransactions: 50,
        pendingTransactions: 20
    }));
}
