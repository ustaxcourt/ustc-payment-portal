import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('transactions', (t) => {
    t.timestamp('transaction_date').nullable();
    t.date('payment_date').nullable();
    t.integer('return_code').nullable();
    t.text('return_detail').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('transactions', (t) => {
    t.dropColumn('transaction_date');
    t.dropColumn('payment_date');
    t.dropColumn('return_code');
    t.dropColumn('return_detail');
  });
}
