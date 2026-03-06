import type { Knex } from 'knex';
import { randomUUID } from 'crypto';

/**
 * Seed: Inserts baseline 200 transaction records matching the
 * new Transaction table schema defined in migrations.
 */
export async function seed(knex: Knex): Promise<void> {
    // Clear existing rows
    await knex('transactions').del();

    const now = knex.fn.now();

    const clientNames = [
        'payment-portal',
        'efile-portal',
        'clerk-app',
    ];

    const paymentStatuses = [
        'pending',
        'completed',
        'failed',
        'refunded',
        'canceled',
    ];

    const transactionStatuses = [
        'initiated',
        'processing',
        'finished',
        'errored',
        null, // Some transactions legitimately have null transactionStatus
    ];

    const feeNames = ['Filing Fee', 'Access Fee', 'Transcript Fee'];
    const feeIds = ['FEE-001', 'FEE-002', 'FEE-003'];

    const paymentMethods = ['card', 'ach', 'cash', 'check'];

    const rows = [];

    for (let i = 1; i <= 200; i++) {
        const agencyTrackingId = randomUUID();
        const transactionRef = `TXREF-${i.toString().padStart(5, '0')}`;

        rows.push({
            agency_tracking_id: agencyTrackingId,
            paygov_tracking_id: Math.random() > 0.5 ? `PG-${randomUUID()}` : null,

            fee_name: feeNames[i % feeNames.length],
            fee_id: feeIds[i % feeIds.length],
            fee_amount: (5 + (i % 20)) * 1.25, // e.g., 6.25, 7.50, ... (numeric type)

            client_name: clientNames[i % clientNames.length],
            transaction_reference_id: transactionRef,

            payment_status: paymentStatuses[i % paymentStatuses.length],
            transaction_status: transactionStatuses[i % transactionStatuses.length],

            payment_method: paymentMethods[i % paymentMethods.length],
            paygov_token: Math.random() > 0.7 ? randomUUID() : null,

            metadata: {
                note: `Generated seed transaction #${i}`,
                retryCount: Math.floor(Math.random() * 3),
            },

            created_at: now,
            last_updated_at: now,
        });
    }

    // Insert in chunks
    const chunkSize = 50;
    for (let i = 0; i < rows.length; i += chunkSize) {
        await knex('transactions').insert(rows.slice(i, i + chunkSize));
    }
}
