import { faker } from "@faker-js/faker";
import dayjs from "dayjs";
import { EARLIEST_FEE_ACTIVATION_MS } from "./seededFees";
import type { Archetype } from "./types";

/** Never let a row's date predate every seeded fee — `getActiveFee` would throw. */
export const atLeastActivation = (d: dayjs.Dayjs): dayjs.Dayjs =>
  d.valueOf() < EARLIEST_FEE_ACTIVATION_MS
    ? dayjs(EARLIEST_FEE_ACTIVATION_MS)
    : d;

// Pay.gov's "official example" wire format is local time with no offset — see
// `CompleteOnlineCollectionWithDetailsResponseSchema`.
export const formatPayGovDateTime = (d: dayjs.Dayjs): string =>
  d.format("YYYY-MM-DDTHH:mm:ss");
export const formatPayGovDate = (d: dayjs.Dayjs): string =>
  d.format("YYYY-MM-DD");

/** A random instant on `day`, never later than `cap`. */
export const randomInstantWithinDay = (
  day: dayjs.Dayjs,
  cap: dayjs.Dayjs,
): dayjs.Dayjs => {
  const instant = atLeastActivation(
    day.startOf("day").add(faker.number.int({ min: 0, max: 86_399 }), "second"),
  );
  return instant.isAfter(cap) ? cap : instant;
};

/**
 * When the row was created. In-flight archetypes are anchored to "now" (they
 * only occur on the most recent days and their realism depends on being fresh);
 * everything else is placed at a random time on its assigned `day`.
 */
export const pickCreatedAt = (
  archetype: Archetype,
  day: dayjs.Dayjs,
  now: dayjs.Dayjs,
): string => {
  switch (archetype) {
    case "received":
      return atLeastActivation(
        now.subtract(faker.number.int({ min: 1, max: 120 }), "minute"),
      ).toISOString();
    case "processing":
      // Stay well inside PROCESSING_STALE_MS (10 min) so the row is not read as
      // an abandoned claim.
      return atLeastActivation(
        now.subtract(faker.number.int({ min: 1, max: 8 }), "minute"),
      ).toISOString();
    case "initiated":
      // Most sit within the 3h Pay.gov token TTL; the rest are abandoned redirects.
      return atLeastActivation(
        faker.datatype.boolean({ probability: 0.8 })
          ? now.subtract(faker.number.int({ min: 2, max: 170 }), "minute")
          : now.subtract(faker.number.int({ min: 1, max: 10 }), "day"),
      ).toISOString();
    default:
      return randomInstantWithinDay(
        day,
        now.subtract(2, "minute"),
      ).toISOString();
  }
};

export const deriveTimestamps = (
  archetype: Archetype,
  createdAtIso: string,
  isAch: boolean,
  now: dayjs.Dayjs,
): {
  lastUpdatedAt: string;
  transactionDate: string | null;
  paymentDate: string | null;
} => {
  const created = dayjs(createdAtIso);
  const clamp = (d: dayjs.Dayjs): dayjs.Dayjs => (d.isAfter(now) ? now : d);

  let lastUpdated = created;
  let transactionDate: string | null = null;
  let paymentDate: string | null = null;

  switch (archetype) {
    case "received":
      lastUpdated = clamp(
        created.add(faker.number.int({ min: 0, max: 30 }), "second"),
      );
      break;
    case "initiated":
      lastUpdated = clamp(
        created.add(faker.number.int({ min: 1, max: 20 }), "second"),
      );
      break;
    case "processing":
      lastUpdated = clamp(
        created.add(faker.number.int({ min: 1, max: 45 }), "second"),
      );
      break;
    case "failed":
      lastUpdated = clamp(
        created.add(faker.number.int({ min: 20, max: 180 }), "second"),
      );
      break;
    case "settling": {
      // Pay.gov accepts the ACH debit within seconds; settlement is still days out.
      const acceptedAt = clamp(
        created.add(faker.number.int({ min: 30, max: 120 }), "second"),
      );
      lastUpdated = acceptedAt;
      transactionDate = formatPayGovDateTime(acceptedAt);
      paymentDate = formatPayGovDate(acceptedAt);
      break;
    }
    case "success": {
      const acceptedAt = clamp(
        created.add(faker.number.int({ min: 20, max: 400 }), "second"),
      );
      transactionDate = formatPayGovDateTime(acceptedAt);
      if (isAch) {
        // ACH is only marked processed once settlement clears, days later.
        const settledAt = clamp(
          created.add(faker.number.int({ min: 2, max: 5 }), "day"),
        );
        lastUpdated = settledAt;
        paymentDate = formatPayGovDate(settledAt);
      } else {
        lastUpdated = acceptedAt;
        paymentDate = formatPayGovDate(acceptedAt);
      }
      break;
    }
  }

  return {
    lastUpdatedAt: lastUpdated.toISOString(),
    transactionDate,
    paymentDate,
  };
};
