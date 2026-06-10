import type { Knex } from "knex";

type CanonicalFeeRow = {
  fee_id: string;
  fee_key: string;
  name: string;
  tcs_app_id: string;
  is_variable: boolean;
  amount: number;
  description: string;
  activation_date: string;
};

const CANONICAL_FEES: CanonicalFeeRow[] = [
  {
    fee_id: "PETITION_FILING_FEE",
    fee_key: "PETITION_FILING_FEE",
    name: "Petition Filing Fee",
    tcs_app_id: "TCSUSTAXCOURTPETITION",
    is_variable: false,
    amount: 60,
    description: "Fee charged for filing a petition with the U.S. Tax Court.",
    activation_date: "2026-03-05T00:00:00Z",
  },
  {
    fee_id: "NONATTORNEY_EXAM_REGISTRATION_FEE",
    fee_key: "NONATTORNEY_EXAM_REGISTRATION_FEE",
    name: "Non-Attorney Exam Registration Fee",
    tcs_app_id: "TCSUSTAXCOURTANAEF",
    is_variable: false,
    amount: 250,
    description:
      "Fee for non-attorneys to register for an examination with the U.S. Tax Court.",
    activation_date: "2026-03-05T00:00:00Z",
  },
];

export async function up(knex: Knex): Promise<void> {
  await knex("fees").insert(CANONICAL_FEES).onConflict("fee_id").merge();
}

export async function down(knex: Knex): Promise<void> {
  await knex("fees")
    .whereIn(
      "fee_id",
      CANONICAL_FEES.map((fee) => fee.fee_id),
    )
    .delete();
}
