import { faker } from "@faker-js/faker";
import { staticFees } from "../../../../src/config/fees";

/**
 * The two production clients. Client name ⇄ fee key is 1:1, and the fee key
 * determines the shape of the metadata the client submits — see
 * `src/schemas/Metadata.schema.ts`:
 *   - PETITION_FILING_FEE               → { docketNumber }              (Dawson)
 *   - NONATTORNEY_EXAM_REGISTRATION_FEE → { email, fullName, accessCode }
 *
 * `weight` skews the fee mix — petition filings vastly outnumber non-attorney
 * exam registrations in practice.
 */
export const SEEDED_FEES = [
  { key: "PETITION_FILING_FEE", client: "Dawson", weight: 85 },
  {
    key: "NONATTORNEY_EXAM_REGISTRATION_FEE",
    client: "Non-Attorney Admissions Exam Registration App",
    weight: 15,
  },
] as const;

export type SeededFee = (typeof SEEDED_FEES)[number];

const feeActivationMs = (key: SeededFee["key"]): number =>
  Math.min(
    ...staticFees[key].versions.map((version) =>
      Date.parse(version.activationDate),
    ),
  );

/** Earliest instant at which any seeded fee is active. */
export const EARLIEST_FEE_ACTIVATION_MS = Math.min(
  ...SEEDED_FEES.map((fee) => feeActivationMs(fee.key)),
);

/** Weighted pick among the fees already active at `whenIso`. */
export const pickFeeActiveOn = (whenIso: string): SeededFee => {
  const whenMs = Date.parse(whenIso);
  const eligible = SEEDED_FEES.filter(
    (fee) => feeActivationMs(fee.key) <= whenMs,
  );
  // Every row's date is clamped to EARLIEST_FEE_ACTIVATION_MS, so `eligible` is
  // always non-empty here.
  return faker.helpers.weightedArrayElement(
    eligible.map((fee) => ({ weight: fee.weight, value: fee })),
  );
};
