import type { Knex } from 'knex';
import { randomUUID } from 'crypto';
import { faker } from '@faker-js/faker';
import dayjs from 'dayjs';

/**
 * Seed: Inserts baseline 200 fake-but-realistic transaction records.
 */
export async function seed(knex: Knex): Promise<void> {
    // Clear out previous data
    await knex('transactions').del();

    const clientNames = ['payment-portal', 'efile-portal', 'clerk-app'];
    const paymentStatuses = ['pending', 'success', 'failed'];
    const transactionStatuses = ['received', 'initiated', 'pending', 'processed', 'failed'];
    const paymentMethods = ['plastic_card', 'ach', 'paypal'];
    const feeNames = ['Filing Fee', 'Access Fee', 'Transcript Fee'];
    const feeIds = ['FEE-001', 'FEE-002', 'FEE-003'];

    const agencyIds = ['USTC', 'IRS', 'SSA', 'VA', 'DHS'];
    const accountHolders = ['John Doe', 'Jane Smith', 'Alex Johnson', 'Client User'];

    // Small helper to rotate array values
    const pick = <T>(arr: T[], index: number): T => arr[index % arr.length];

    const rows = [];

    for (let i = 1; i <= 200; i++) {
        const agencyTrackingId = randomUUID();

        // Transaction reference ID (unique per client)
        const transactionReferenceId = `TXREF-${i.toString().padStart(5, '0')}`;

        const createdAt = dayjs()
            .subtract(faker.number.int({ min: 1, max: 40 }), 'day')
            .add(faker.number.int({ min: 0, max: 86400 }), 'second')
            .toISOString();

        const lastUpdatedAt = dayjs(createdAt)
            .add(faker.number.int({ min: 0, max: 5 }), 'day')
            .add(faker.number.int({ min: 0, max: 3600 }), 'second')
            .toISOString();

        // Optional metadata every 6 rows
        const maybeMetadata =
            i % 6 === 0
                ? {
                    accountHolder: pick(accountHolders, i),
                    agencyId: pick(agencyIds, i),
                    userAgent: faker.internet.userAgent(),
                    isHighValue: faker.number.int({ min: 100, max: 900 }) >= 200 ? 'true' : 'false',
                }
                : null;

        rows.push({
            agency_tracking_id: agencyTrackingId,
            paygov_tracking_id: faker.datatype.boolean() ? `PG-${randomUUID()}` : null,

            fee_name: pick(feeNames, i),
            fee_id: pick(feeIds, i),
            fee_amount: faker.number.float({ min: 5, max: 500, fractionDigits: 2 }),

            client_name: pick(clientNames, i),
            transaction_reference_id: transactionReferenceId,

            payment_status: String(pick(paymentStatuses, i)).toLowerCase(),
            transaction_status: String(pick(transactionStatuses, i)).toLowerCase(),

            payment_method: pick(paymentMethods, i),
            paygov_token: faker.datatype.boolean() ? faker.string.uuid() : null,

            metadata: maybeMetadata,

            created_at: createdAt,
            last_updated_at: lastUpdatedAt,
        });
    }

    // Insert in chunks to avoid huge INSERTs
    const chunkSize = 50;
    for (let i = 0; i < rows.length; i += chunkSize) {
        await knex('transactions').insert(rows.slice(i, i + chunkSize));
    }
}
