import { faker } from "@faker-js/faker";
import dayjs from "dayjs";
import { getActiveFee } from "../../../src/config/fees";
import { generateAgencyTrackingId } from "../../../src/utils/generateTrackingId";
import {
  PAYMENT_STATUS_BY_ARCHETYPE,
  pickArchetypeForDay,
  TRANSACTION_STATUS_BY_ARCHETYPE,
} from "./utils/archetypes";
import { buildMetadata } from "./utils/metadata";
import { pickFailureReason, pickPaymentMethod } from "./utils/payment";
import {
  EARLIEST_FEE_ACTIVATION_MS,
  pickFeeActiveOn,
  type SeededFee,
} from "./utils/seededFees";
import {
  deriveTimestamps,
  pickCreatedAt,
  randomInstantWithinDay,
} from "./utils/timestamps";
import type { Archetype, TransactionRow } from "./utils/types";

type GenerateTransactionsParams = {
  /** Groups of rows sharing one obligation (failed attempt then a successful retry). */
  multiAttemptGroups?: number;
  /** Earliest day rows are dated to; clamped forward to the earliest fee activation. */
  startDate?: string;
  /** Total rows, spread across every day from `startDate` to today. Retry rows count toward this. */
  numberOfRecords: number;
};

type RowOverrides = {
  fee?: SeededFee;
  createdAt?: string;
  transactionReferenceId?: string;
  metadata?: Record<string, string> | null;
  forcePaymentMethod?: string;
};

const makeRow = (
  archetype: Archetype,
  day: dayjs.Dayjs,
  now: dayjs.Dayjs,
  overrides: RowOverrides = {},
): TransactionRow => {
  const createdAt = overrides.createdAt ?? pickCreatedAt(archetype, day, now);
  const fee = overrides.fee ?? pickFeeActiveOn(createdAt);
  const metadata = overrides.metadata ?? buildMetadata(fee.key);

  const paymentMethod =
    overrides.forcePaymentMethod ?? pickPaymentMethod(archetype);
  const isAch = paymentMethod === "ach";

  const { lastUpdatedAt, transactionDate, paymentDate } = deriveTimestamps(
    archetype,
    createdAt,
    isAch,
    now,
  );

  // Amount is pinned to the fee version in effect at creation time. Neither
  // seeded fee is variable, so this is always the flat configured amount.
  const activeFee = getActiveFee(fee.key, createdAt);
  if (activeFee.amount === null || activeFee.amount === undefined) {
    throw new Error(`Fixed fee '${fee.key}' is missing an amount`);
  }

  const hasToken = archetype !== "received";
  const hasPayGovResponse = archetype === "settling" || archetype === "success";
  const failureReason = archetype === "failed" ? pickFailureReason() : null;

  return {
    agency_tracking_id: generateAgencyTrackingId(),
    paygov_tracking_id: hasPayGovResponse
      ? faker.string.alphanumeric({ length: 20, casing: "upper" })
      : null,
    fee: fee.key,
    client_name: fee.client,
    transaction_reference_id:
      overrides.transactionReferenceId ?? faker.string.uuid(),
    payment_status: PAYMENT_STATUS_BY_ARCHETYPE[archetype],
    transaction_status: TRANSACTION_STATUS_BY_ARCHETYPE[archetype],
    payment_method: paymentMethod,
    transaction_amount: activeFee.amount,
    paygov_token: hasToken ? faker.string.uuid().replace(/-/g, "") : null,
    transaction_date: transactionDate,
    payment_date: paymentDate,
    return_code: failureReason ? failureReason.code : null,
    return_detail: failureReason ? failureReason.detail : null,
    metadata: metadata ?? {},
    created_at: createdAt,
    last_updated_at: lastUpdatedAt,
  };
};

/**
 * A declined first attempt followed by a successful retry, dated to a random day
 * in range. Both rows share the obligation's `transaction_reference_id`, fee,
 * client, and metadata — only the failed attempt predates the success.
 */
const makeRetryGroup = (
  start: dayjs.Dayjs,
  now: dayjs.Dayjs,
): TransactionRow[] => {
  const spanDays = Math.max(
    0,
    now.startOf("day").diff(start.startOf("day"), "day"),
  );
  const day = start.add(faker.number.int({ min: 0, max: spanDays }), "day");

  const failedAt = randomInstantWithinDay(day, now.subtract(1, "hour"));
  const successAt = (() => {
    const candidate = failedAt.add(
      faker.number.int({ min: 2, max: 240 }),
      "minute",
    );
    return candidate.isAfter(now.subtract(1, "minute"))
      ? now.subtract(1, "minute")
      : candidate;
  })();

  const fee = pickFeeActiveOn(failedAt.toISOString());
  const transactionReferenceId = faker.string.uuid();
  const metadata = buildMetadata(fee.key);
  const shared = { fee, transactionReferenceId, metadata };

  return [
    makeRow("failed", day, now, {
      ...shared,
      createdAt: failedAt.toISOString(),
    }),
    makeRow("success", day, now, {
      ...shared,
      createdAt: successAt.toISOString(),
      // People retry a declined card with another card.
      forcePaymentMethod: "plastic_card",
    }),
  ];
};

/**
 * Dummy data seed generator: `numberOfRecords` fake-but-realistic rows spread as
 * evenly as possible across every day from the effective start date to today,
 * any remainder going to the earliest days. Retry-group rows are reserved out of
 * the total. Status pairs, populated columns, metadata shapes, and timestamps
 * track what the production model would actually produce.
 */
export const generateTransactions = async ({
  multiAttemptGroups = 0,
  startDate = "2025-01-01",
  numberOfRecords = 3500,
}: GenerateTransactionsParams): Promise<TransactionRow[]> => {
  const now = dayjs();
  const requestedStart = dayjs(startDate).startOf("day");
  const activationFloor = dayjs(EARLIEST_FEE_ACTIVATION_MS);
  // Never date a row before any seeded fee exists — getActiveFee would throw.
  const start = (
    requestedStart.isAfter(activationFloor) ? requestedStart : activationFloor
  ).startOf("day");

  if (start.isAfter(now)) {
    throw new Error(
      `SEED_START_DATE ${startDate} is after today; no rows can be generated`,
    );
  }

  const totalDays = Math.max(
    1,
    now.startOf("day").diff(start.startOf("day"), "day") + 1,
  );
  const targetRows = Math.max(0, numberOfRecords - multiAttemptGroups * 2);
  const baseRowsPerDay = Math.floor(targetRows / totalDays);
  const remainder = targetRows % totalDays;

  const rows: TransactionRow[] = [];
  let dayIndex = 0;
  for (
    let day = start;
    !day.startOf("day").isAfter(now, "day");
    day = day.add(1, "day")
  ) {
    const rowsToday = baseRowsPerDay + (dayIndex < remainder ? 1 : 0);
    const daysAgo = now.startOf("day").diff(day.startOf("day"), "day");
    for (let i = 0; i < rowsToday; i++) {
      rows.push(makeRow(pickArchetypeForDay(daysAgo), day, now));
    }
    dayIndex++;
  }

  for (let i = 0; i < multiAttemptGroups; i++) {
    rows.push(...makeRetryGroup(start, now));
  }

  return rows;
};
