import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("transactions", (t) => {
    t.string("paygov_token", 36).nullable().alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("transactions", (t) => {
    t.string("paygov_token", 32).nullable().alter();
  });
}
