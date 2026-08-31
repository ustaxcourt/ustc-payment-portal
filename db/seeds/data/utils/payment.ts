import { faker } from "@faker-js/faker";
import type { Archetype } from "./types";

/**
 * Illustrative Pay.gov failure reasons. The code ⇄ detail pairing is fixed: a
 * failed row's `return_code` always matches its `return_detail`. These are
 * placeholders modelled on typical card-processor declines — swap in the real
 * Pay.gov TCS return codes once they are known.
 */
export const FAILURE_RETURN_REASONS: ReadonlyArray<{
  code: number;
  detail: string;
}> = [
  { code: 1010, detail: "The card was declined by the issuing bank." },
  { code: 1011, detail: "The card has insufficient funds." },
  { code: 1012, detail: "The card number is invalid." },
  { code: 1013, detail: "The card has expired." },
  { code: 1014, detail: "The card security code is incorrect." },
  { code: 2001, detail: "The bank account could not be verified." },
  { code: 5000, detail: "An internal error occurred. Please try again." },
];

export const pickFailureReason = (): { code: number; detail: string } =>
  faker.helpers.arrayElement(FAILURE_RETURN_REASONS);

export const pickPaymentMethod = (archetype: Archetype): string | null => {
  if (archetype === "settling") {
    // Only ACH sits in a pending transaction_status before finalising.
    return "ach";
  }
  if (archetype === "success") {
    return faker.helpers.weightedArrayElement([
      { weight: 70, value: "plastic_card" },
      { weight: 20, value: "ach" },
      { weight: 10, value: "paypal" },
    ]);
  }
  // received / initiated / processing: the user has not paid yet.
  // failed: `updateToFailed` never records a method.
  return null;
};
