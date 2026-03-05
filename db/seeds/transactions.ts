import type { Knex } from 'knex';
import { randomUUID } from 'crypto';

export async function seed(knex: Knex): Promise<void> {
    await knex('transactions').del();

    const clientApp = 'payment-portal';
    const statuses = ['pending', 'succeeded', 'failed', 'refunded', 'canceled'];
    const feeCodes = ['FEE-001', 'FEE-002', 'FEE-003', 'FEE-004', 'FEE-005'];

    const now = knex.fn.now();
    const rows: Array<Record<string, any>> = [];

    for (let i = 1; i <= 200; i++) {
        const externalRef = `REF-${i.toString().padStart(4, '0')}`;

        rows.push({
            id: randomUUID(),
            client_app: clientApp,
            external_reference_id: externalRef,
            fee_code: feeCodes[(i - 1) % feeCodes.length],
            amount_cents: 500 * ((i % 10) + 1), // $5.00, $10.00, ..., $55.00
            currency: 'USD',
            status: statuses[(i - 1) % statuses.length],
            created_at: now,
            updated_at: now,
        });
    }

    const chunkSize = 50;
    for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        await knex('transactions').insert(chunk);
    }
}
