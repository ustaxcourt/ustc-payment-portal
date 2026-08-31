import { faker } from "@faker-js/faker";
import dayjs from "dayjs";
import { staticFees, type FeeVersion } from "../../../src/config/fees";
import { generateAgencyTrackingId } from "../../../src/utils/generateTrackingId";

type GenerateTransactionsParams = {
  multiAttemptGroups?: number;
  startDate?: string;
  numberOfRecords: number;
};

type TransactionRow = {
  agency_tracking_id: string;
  paygov_tracking_id: string | null;
  fee: string;
  client_name: string;
  transaction_reference_id: string;
  payment_status: string;
  transaction_status: string | null;
  paygov_token: string | null;
  payment_method: string | null;
  transaction_amount: number;
  transaction_date: string | null;
  payment_date: string | null;
  return_code: number | null;
  return_detail: string | null;
  metadata: Record<string, string> | null;
  created_at: string;
  last_updated_at: string;
};

const getDateRange = (startDate?: string) => {
  const parsedStartDate = startDate ? dayjs(startDate) : dayjs();

  if (!parsedStartDate.isValid()) {
    throw new Error("SEED_START_DATE must be a valid date string");
  }

  const normalizedStartDate = parsedStartDate.startOf("day");
  const endDate = dayjs().endOf("day");

  if (normalizedStartDate.isAfter(endDate)) {
    throw new Error("SEED_START_DATE must be on or before today");
  }

  return {
    startDate: normalizedStartDate,
    endDate,
  };
};

const getSeedFeeVersion = (fee: string): FeeVersion => {
  const definition = staticFees[fee];

  if (!definition) {
    throw new Error(`No configured fee found for '${fee}'`);
  }

  const latestVersion = [...definition.versions].sort(
    (left, right) =>
      Date.parse(right.activationDate) - Date.parse(left.activationDate),
  )[0];

  if (!latestVersion) {
    throw new Error(`Fee '${fee}' has no configured versions`);
  }

  if (
    !latestVersion.isVariable &&
    (latestVersion.amount === null || latestVersion.amount === undefined)
  ) {
    throw new Error(`Fixed fee '${fee}' is missing an amount`);
  }

  return latestVersion;
};

const createRandomDateForDay = (day: dayjs.Dayjs): string =>
  day
    .startOf("day")
    .add(faker.number.int({ min: 0, max: 86399 }), "second")
    .toISOString();

export const generateTransactions = async ({
  multiAttemptGroups = 0,
  startDate,
  numberOfRecords,
}: GenerateTransactionsParams): Promise<TransactionRow[]> => {
  const { startDate: start, endDate } = getDateRange(startDate);

  const feesList = Object.keys(staticFees);
  const clientNames = ["payment-portal", "efile-portal", "clerk-app"];
  const paymentMethods = ["plastic_card", "ach", "paypal"] as const;

  const agencyIds = ["USTC", "IRS"];

  const getTransactionStatus = (
    paymentStatus: "success" | "failed" | "pending",
  ): string => {
    switch (paymentStatus) {
      case "success":
        return "processed";
      case "failed":
        return "failed";
      case "pending":
        return faker.helpers.arrayElement(["initiated", "received", "pending"]);
    }
  };

  const returnCodes = [3001, 3002, 5000];

  const returnDetails = [
    "The card has been declined, the transaction will not be processed.",
    "Invalid card number.",
    "An internal error occurred. Please try again.",
  ];

  type RowOverrides = {
    transactionReferenceId?: string;
    fee?: (typeof feesList)[number];
    clientName?: string;
    agencyId?: string;
    createdAt?: string;
  };

  const makeRow = (
    payment_status: "success" | "failed" | "pending",
    overrides: RowOverrides = {},
  ): TransactionRow => {
    const agencyId =
      overrides.agencyId ?? faker.helpers.arrayElement(agencyIds);

    const transactionReferenceId =
      overrides.transactionReferenceId ?? faker.string.uuid();

    const createdAt = overrides.createdAt ?? dayjs().toISOString();

    let fee = overrides.fee;
    let seedFeeVersion: FeeVersion;

    if (fee) {
      seedFeeVersion = getSeedFeeVersion(fee);
    } else {
      fee = faker.helpers.arrayElement(feesList);
      seedFeeVersion = getSeedFeeVersion(fee);
    }

    const lastUpdatedAt = start
      .add(
        faker.number.int({
          min: 0,
          max: endDate.diff(start, "second"),
        }),
        "second",
      )
      .toISOString();

    const transactionAmount = seedFeeVersion.isVariable
      ? faker.number.float({
          min: 1,
          max: 1_000,
          fractionDigits: 2,
        })
      : seedFeeVersion.amount;

    const maybeMetadata = {
      accountHolder: faker.person.fullName(),
      agencyId,
      userAgent: faker.internet.userAgent(),
      isHighValue:
        faker.number.int({ min: 100, max: 900 }) >= 200 ? "true" : "false",
    };

    const hasPayGovResponse =
      payment_status === "success" || payment_status === "failed";

    const transactionDate = hasPayGovResponse
      ? dayjs(lastUpdatedAt).format("YYYY-MM-DDTHH:mm:ss")
      : null;

    const paymentDate = hasPayGovResponse
      ? dayjs(lastUpdatedAt).format("YYYY-MM-DD")
      : null;

    if (transactionAmount === null || transactionAmount === undefined) {
      throw new Error(`Fixed fee '${fee}' is missing an amount`);
    }

    const amount: number = transactionAmount;

    return {
      agency_tracking_id: generateAgencyTrackingId(),
      paygov_tracking_id: faker.datatype.boolean()
        ? faker.string.alphanumeric({
            length: 20,
            casing: "upper",
          })
        : null,
      fee,
      client_name:
        overrides.clientName ?? faker.helpers.arrayElement(clientNames),
      transaction_reference_id: transactionReferenceId,
      payment_status,
      transaction_status: getTransactionStatus(payment_status),
      payment_method: faker.helpers.arrayElement(paymentMethods),
      transaction_amount: amount,
      paygov_token: faker.datatype.boolean()
        ? faker.string.uuid().replace(/-/g, "")
        : null,
      transaction_date: transactionDate,
      payment_date: paymentDate,
      return_code:
        payment_status === "failed"
          ? faker.helpers.arrayElement(returnCodes)
          : null,
      return_detail:
        payment_status === "failed"
          ? faker.helpers.arrayElement(returnDetails)
          : null,
      metadata: maybeMetadata,
      created_at: createdAt,
      last_updated_at: lastUpdatedAt,
    };
  };

  const makeMultiAttemptGroup = (
    outcomes: Array<"success" | "failed" | "pending">,
  ): TransactionRow[] => {
    const transactionReferenceId = faker.string.uuid();
    const clientName = faker.helpers.arrayElement(clientNames);
    const agencyId = faker.helpers.arrayElement(agencyIds);

    const randomDay = start.add(
      faker.number.int({
        min: 0,
        max: endDate.diff(start, "day"),
      }),
      "day",
    );

    const baseDate = dayjs(createRandomDateForDay(randomDay));

    let elapsed = 0;

    return outcomes.map((outcome) => {
      const createdAt = baseDate.add(elapsed, "minute").toISOString();

      elapsed += faker.number.int({
        min: 20,
        max: 60,
      });

      return makeRow(outcome, {
        transactionReferenceId,
        clientName,
        agencyId,
        createdAt,
      });
    });
  };

  // Generate a fixed total number of transactions and distribute them
  // as evenly as possible across the date range. Any remainder is
  // allocated one-by-one to the earliest days. Multi-attempt rows are
  // reserved separately and included in the total.
  const rows: TransactionRow[] = [];

  const days = endDate.diff(start, "day") + 1;
  const targetRows = Math.max(0, numberOfRecords - multiAttemptGroups * 2);

  const baseTransactionsPerDay = Math.floor(targetRows / days);
  const extraTransactions = targetRows % days;

  let dayIndex = 0;

  for (let day = start; day.isBefore(endDate); day = day.add(1, "day")) {
    const transactionCount =
      baseTransactionsPerDay + (dayIndex < extraTransactions ? 1 : 0);

    dayIndex++;

    for (let i = 0; i < transactionCount; i++) {
      const paymentStatus = faker.helpers.weightedArrayElement([
        { value: "success", weight: 80 },
        { value: "failed", weight: 15 },
        { value: "pending", weight: 5 },
      ]) as "success" | "failed" | "pending";

      rows.push(
        makeRow(paymentStatus, {
          createdAt: createRandomDateForDay(day),
        }),
      );
    }
  }

  const multiAttemptRows = Array.from({ length: multiAttemptGroups }, () =>
    makeMultiAttemptGroup(["failed", "success"]),
  ).flat();

  rows.push(...multiAttemptRows);

  return rows;
};
