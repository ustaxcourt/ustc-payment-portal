import { faker } from "@faker-js/faker";
import type { PaymentStatus } from "../../../../src/schemas/PaymentStatus.schema";
import type { TransactionStatus } from "../../../../src/schemas/TransactionStatus.schema";
import type { Archetype } from "./types";

export const TRANSACTION_STATUS_BY_ARCHETYPE: Record<
  Archetype,
  TransactionStatus
> = {
  received: "received",
  initiated: "initiated",
  processing: "processing",
  settling: "pending",
  success: "processed",
  failed: "failed",
};

export const PAYMENT_STATUS_BY_ARCHETYPE: Record<Archetype, PaymentStatus> = {
  received: "pending",
  initiated: "pending",
  processing: "pending",
  settling: "pending",
  success: "success",
  failed: "failed",
};

/**
 * Archetype mix for a row dated `daysAgo` days before today. Rows more than a
 * week old are terminal — nothing realistically sits mid-workflow for that long.
 * The last couple of days carry the in-flight and ACH-settling states.
 */
export const pickArchetypeForDay = (daysAgo: number): Archetype => {
  if (daysAgo >= 8) {
    return faker.helpers.weightedArrayElement([
      { weight: 84, value: "success" },
      { weight: 16, value: "failed" },
    ]);
  }
  if (daysAgo >= 2) {
    return faker.helpers.weightedArrayElement([
      { weight: 78, value: "success" },
      { weight: 15, value: "failed" },
      { weight: 7, value: "settling" },
    ]);
  }
  return faker.helpers.weightedArrayElement([
    { weight: 45, value: "success" },
    { weight: 12, value: "failed" },
    { weight: 8, value: "settling" },
    { weight: 26, value: "initiated" },
    { weight: 3, value: "processing" },
    { weight: 6, value: "received" },
  ]);
};
