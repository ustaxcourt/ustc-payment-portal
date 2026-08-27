import { faker } from "@faker-js/faker";
import dayjs from "dayjs";
import { getActiveFee, staticFees } from "../../../src/config/fees";
import { generateAgencyTrackingId } from "../../../src/utils/generateTrackingId";

type GenerateTransactionsParams = {
  multiAttemptGroups?: number;
  startYear?: number;
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

const getDateRange = (startYear?: number) => {
  const currentYear = dayjs().year();

  return {
    startDate: dayjs(`${startYear ?? currentYear}-01-01`).startOf("day"),
    endDate: dayjs().endOf("day"),
  };
};

const createRandomDateForDay = (day: dayjs.Dayjs): string =>
  day
    .startOf("day")
    .add(faker.number.int({ min: 0, max: 86399 }), "second")
    .toISOString();

export const generateTransactions = async ({
  multiAttemptGroups = 0,
  startYear,
}: GenerateTransactionsParams): Promise<TransactionRow[]> => {
  const { startDate, endDate } = getDateRange(startYear);

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
    let activeFee;

    if (fee) {
      activeFee = getActiveFee(fee, createdAt);
    } else {
      while (true) {
        const candidateFee = faker.helpers.arrayElement(feesList);

        try {
          activeFee = getActiveFee(candidateFee, createdAt);
          fee = candidateFee;
          break;
        } catch {
          // try another fee
        }
      }
    }

    const lastUpdatedAt = dayjs(createdAt)
      .add(faker.number.int({ min: 0, max: 5 }), "day")
      .add(faker.number.int({ min: 0, max: 3600 }), "second")
      .toISOString();

    const transactionAmount = activeFee.isVariable
      ? faker.number.float({
          min: 1,
          max: 1_000,
          fractionDigits: 2,
        })
      : activeFee.amount;

    if (transactionAmount === null || transactionAmount === undefined) {
      throw new Error(`Fixed fee '${fee}' is missing an amount`);
    }

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
      transaction_amount: transactionAmount,
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

    const randomDay = startDate.add(
      faker.number.int({
        min: 0,
        max: endDate.diff(startDate, "day"),
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

  const rows: TransactionRow[] = [];

  for (let day = startDate; day.isBefore(endDate); day = day.add(1, "day")) {
    const transactionCount = faker.number.int({
      min: 0,
      max: 10,
    });

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
