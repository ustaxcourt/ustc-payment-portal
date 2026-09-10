import { faker } from "@faker-js/faker";
import type { SeededFee } from "./seededFees";

/**
 * A metadata bag matching the fee's client contract — see
 * `src/schemas/Metadata.schema.ts`.
 */
export const buildMetadata = (
  feeKey: SeededFee["key"],
): Record<string, string> => {
  switch (feeKey) {
    case "PETITION_FILING_FEE":
      return buildDawsonMetadata();
    case "NONATTORNEY_EXAM_REGISTRATION_FEE":
      return buildNonAttorneyMetadata();
    default:
      throw new Error(`No metadata builder for seeded fee "${feeKey}"`);
  }
};

const buildDawsonMetadata = (): Record<string, string> => {
  // Dawson docket number: a petition sequence number that resets each year and
  // runs into the tens of thousands, a dash, then a 2-digit year (e.g. 12345-26).
  const petitionNumber = faker.number.int({ min: 1, max: 50000 });
  const year = faker.helpers.arrayElement(["24", "25", "26"]);
  return { docketNumber: `${petitionNumber}-${year}` };
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
