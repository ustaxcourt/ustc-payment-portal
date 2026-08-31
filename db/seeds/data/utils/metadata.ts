import { faker } from "@faker-js/faker";
import type { SeededFee } from "./seededFees";

/**
 * A metadata bag matching the fee's client contract — see
 * `src/schemas/Metadata.schema.ts`.
 */
export const buildMetadata = (
  feeKey: SeededFee["key"],
): Record<string, string> => {
  if (feeKey === "PETITION_FILING_FEE") {
    // Dawson docket number: 3 digits, a dash, then a 2-digit year (e.g. 123-26).
    const index = faker.number.int({ min: 100, max: 999 });
    const year = faker.helpers.arrayElement(["24", "25", "26"]);
    return { docketNumber: `${index}-${year}` };
  }

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
