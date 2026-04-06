import type { Knex } from 'knex';
import { faker } from '@faker-js/faker';
import dayjs from 'dayjs';

/**
 * Seed: Inserts baseline fake-but-realistic transaction records.
 */
export async function seed(knex: Knex): Promise<void> {
    // Clear out previous data
    await knex('transactions').del();

    const totalTransactions = 100;
    const clientNames = ['payment-portal', 'efile-portal', 'clerk-app'];
    const transactionStatuses = ['received', 'initiated', 'pending', 'processed', 'failed'];
    const paymentMethods = ['plastic_card', 'ach', 'paypal'];
    const feesList = [
        { feeId: 'PETITION_FILING_FEE', feeAmount: 150.00, feeName: 'Petition Filing Fee' },
        { feeId: 'NONATTORNEY_EXAM_REGISTRATION_FEE', feeAmount: 200.00, feeName: 'Non-Attorney Exam Registration Fee' }
    ];

    const agencyIds = ['USTC', 'IRS'];
    const agencyCounters: Record<string, number> = Object.fromEntries(agencyIds.map((agencyId) => [agencyId, 0]));

    /**
     * To create a realistic distribution of payment statuses, we'll generate a pool of statuses based on desired percentages:
     * - 40% success
     * - 25% failed
     * - 35% pending
     */
    const successCount = Math.floor(totalTransactions * 0.34);
    const failedCount = Math.floor(totalTransactions * 0.34);
    const pendingCount = totalTransactions - successCount - failedCount;
    const paymentStatusPool = faker.helpers.shuffle([
        ...Array(successCount).fill('success'),
        ...Array(failedCount).fill('failed'),
        ...Array(pendingCount).fill('pending'),
    ]);

    const rows = [];

    for (let i = 1; i <= totalTransactions; i++) {
        const agencyId = faker.helpers.arrayElement(agencyIds);
        const fee = faker.helpers.arrayElement(feesList);
        agencyCounters[agencyId] += 1;
        const agencyTrackingId = `${agencyId}-${agencyCounters[agencyId].toString().padStart(9, '0')}`;
        const transactionReferenceId = `TXN-REF-${faker.number.int({ min: 0, max: 999999999 }).toString().padStart(9, '0')}`;

        const createdAt = dayjs()
            .subtract(faker.number.int({ min: 1, max: 40 }), 'day')
            .add(faker.number.int({ min: 0, max: 86400 }), 'second')
            .toISOString();

        const lastUpdatedAt = dayjs(createdAt)
            .add(faker.number.int({ min: 0, max: 5 }), 'day')
            .add(faker.number.int({ min: 0, max: 3600 }), 'second')
            .toISOString();

        const maybeMetadata = {
            accountHolder: faker.person.fullName(),
            agencyId,
            userAgent: faker.internet.userAgent(),
            isHighValue: faker.number.int({ min: 100, max: 900 }) >= 200 ? 'true' : 'false',
        };

        rows.push({
            agency_tracking_id: agencyTrackingId,
            paygov_tracking_id: faker.datatype.boolean() ? faker.string.alphanumeric({ length: 20, casing: 'upper' }) : null,

            fee_name: fee.feeName,
            fee_id: fee.feeId,
            fee_amount: fee.feeAmount,

            client_name: faker.helpers.arrayElement(clientNames),
            transaction_reference_id: transactionReferenceId,

            payment_status: paymentStatusPool[i - 1],
            transaction_status: faker.helpers.arrayElement(transactionStatuses),

            payment_method: faker.helpers.arrayElement(paymentMethods),
            paygov_token: faker.datatype.boolean() ? faker.string.uuid().replace(/-/g, '') : null,

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
