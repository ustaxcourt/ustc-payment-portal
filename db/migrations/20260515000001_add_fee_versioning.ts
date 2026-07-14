import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
	// Add fee_key nullable so existing rows can be backfilled before enforcing NOT NULL
	await knex.schema.alterTable("fees", (t) => {
		t.string("fee_key", 100)
			.nullable()
			.comment(
				"Stable client-facing identifier, shared across all versions of this fee",
			);
	});

	await knex.raw("UPDATE fees SET fee_key = fee_id");

	await knex.schema.alterTable("fees", (t) => {
		t.string("fee_key", 100).notNullable().alter();
		t.index(["fee_key"], "idx_fees_fee_key");
	});

	// Add activation_date nullable for backfill, then enforce NOT NULL
	await knex.schema.alterTable("fees", (t) => {
		t.timestamp("activation_date", { useTz: true })
			.nullable()
			.comment("When this fee version becomes active");
	});

	await knex.raw("UPDATE fees SET activation_date = created_at");

	await knex.schema.alterTable("fees", (t) => {
		t.timestamp("activation_date", { useTz: true }).notNullable().alter();
	});

	// No two versions of the same fee_key can share an activation_date
	await knex.raw(`
    ALTER TABLE fees
    ADD CONSTRAINT fees_fee_key_activation_date_unique
    UNIQUE (fee_key, activation_date)
  `);

	// Remove transaction_amount — now derived from the fee version via join
	await knex.schema.raw(`
    ALTER TABLE transactions
    DROP CONSTRAINT IF EXISTS transactions_transaction_amount_nonneg
  `);

	await knex.schema.alterTable("transactions", (t) => {
		t.dropColumn("transaction_amount");
	});
}

export async function down(knex: Knex): Promise<void> {
	// Restore transaction_amount
	await knex.schema.alterTable("transactions", (t) => {
		t.decimal("transaction_amount", 12, 2)
			.nullable()
			.comment("Actual amount charged for this transaction (USD)");
	});

	await knex.raw(`
    UPDATE transactions t
    SET transaction_amount = f.amount
    FROM fees f
    WHERE t.fee_id = f.fee_id
  `);

	await knex.schema.alterTable("transactions", (t) => {
		t.decimal("transaction_amount", 12, 2).notNullable().alter();
	});

	await knex.schema.raw(`
    ALTER TABLE transactions
    ADD CONSTRAINT transactions_transaction_amount_nonneg
    CHECK (transaction_amount >= 0)
  `);

	// Remove fee versioning columns
	await knex.raw(`
    ALTER TABLE fees
    DROP CONSTRAINT IF EXISTS fees_fee_key_activation_date_unique
  `);

	await knex.schema.alterTable("fees", (t) => {
		t.dropIndex(["fee_key"], "idx_fees_fee_key");
		t.dropColumn("activation_date");
		t.dropColumn("fee_key");
	});
}
