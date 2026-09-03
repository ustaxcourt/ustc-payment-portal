import { faker } from "@faker-js/faker";
import type { SeededFee } from "./seededFees";

/**
 * A metadata bag matching the fee's client contract — see
 * `src/schemas/Metadata.schema.ts`.
 */
export const buildMetadata = (
  feeKey: SeededFee["key"],
): Record<string, string> | null => {
  switch (feeKey) {
    case "PETITION_FILING_FEE":
      return buildDawsonMetadata();
    case "NONATTORNEY_EXAM_REGISTRATION_FEE":
      return buildNonAttorneyMetadata();
    default:
      console.warn(`No metadata builder for fee key "${feeKey}" found.`);
      return null; // Return null if no metadata builder is found
  }
};

const buildDawsonMetadata = (): Record<string, string> => {
  // Dawson docket number: 3 digits, a dash, then a 2-digit year (e.g. 123-26).
  const index = faker.number.int({ min: 100, max: 999 });
  const year = faker.helpers.arrayElement(["24", "25", "26"]);
  return { docketNumber: `${index}-${year}` };
};

const buildNonAttorneyMetadata = (): Record<string, string> => {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  return {
    email: faker.internet.email({ firstName, lastName }).toLowerCase(),
    fullName: `${firstName} ${lastName}`,
    accessCode:
      faker.string.alpha({ length: 3, casing: "upper" }) +
      faker.string.numeric({ length: 3 }),
  };
};
