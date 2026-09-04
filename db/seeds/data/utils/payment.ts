import { faker } from "@faker-js/faker";
import { getAllReturnCodes } from "../../../../src/config/payGovReturnCodes";
import type { Archetype } from "./types";

/**
 * Failed-transaction return codes/details, sourced from the real Pay.gov TCS
 * return code reference rather than placeholders.
 */
const FAILURE_RETURN_REASONS = getAllReturnCodes().filter(
  (returnCode) => returnCode.transactionStatus === "Failed",
);

export const pickFailureReason = (): { code: number; detail: string } => {
  const { returnCode, returnDetail } = faker.helpers.arrayElement(
    FAILURE_RETURN_REASONS,
  );
  return { code: returnCode, detail: returnDetail };
};

const PAID_METHOD_MIX = [
  { weight: 70, value: "plastic_card" },
  { weight: 20, value: "ach" },
  { weight: 10, value: "paypal" },
] as const;

export const pickPaymentMethod = (archetype: Archetype): string | null => {
  if (archetype === "settling") {
    // Only ACH sits in a pending transaction_status before finalising.
    return "ach";
  }
  if (archetype === "success" || archetype === "failed") {
    // A decline (`updateAfterPayGovResponse` with a failed status) is reported
    // against the method the payer submitted, so a failed row still carries one.
    return faker.helpers.weightedArrayElement([...PAID_METHOD_MIX]);
  }
  // received / initiated / processing: the user has not paid yet.
  return null;
};
