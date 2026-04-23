import { ClientPermission } from "../types/ClientPermission";
import { GetRequestRequest } from "../entities/GetDetailsRequest";
import { AppContext } from "../types/AppContext";
import { GetDetailsResponse } from "../schemas/GetDetails.schema";
import { TransactionRecordSummary } from "../schemas/TransactionRecord.schema";
import { TransactionStatus } from "../schemas/TransactionStatus.schema";
import { parseTransactionStatus } from "./parseTransactionStatus";
import { derivePaymentStatus } from "../utils/derivePaymentStatus";
import { toApiPaymentMethod } from "../utils/toApiPaymentMethod";
import TransactionModel from "../db/TransactionModel";
import FeesModel from "../db/FeesModel";
import { NotFoundError } from "../errors/notFound";
import { ForbiddenError } from "../errors/forbidden";
import { ServerError } from "../errors/serverError";

type GetDetailsRequest = {
  transactionReferenceId: string;
};

export type GetDetails = (
  appContext: AppContext,
  params: {
    client: ClientPermission;
    request: GetDetailsRequest;
  },
) => Promise<GetDetailsResponse>;

const TERMINAL_STATUSES: ReadonlyArray<TransactionStatus> = [
  "processed",
  "failed",
];

const isTerminal = (status: TransactionStatus | null | undefined): boolean =>
  status !== null && status !== undefined && TERMINAL_STATUSES.includes(status);

const toTransactionRecordSummary = (
  row: TransactionModel,
  transactionStatus: TransactionStatus | null | undefined,
): TransactionRecordSummary => {
  if (!transactionStatus) {
    console.error(
      `Transaction ${row.agencyTrackingId} has null transactionStatus — defaulting to 'received'. This indicates corrupt data.`,
    );
  }
  return {
    payGovTrackingId: row.paygovTrackingId ?? undefined,
    transactionStatus: transactionStatus ?? "received",
    paymentMethod: toApiPaymentMethod(row.paymentMethod),
    createdTimestamp: row.createdAt,
    updatedTimestamp: row.lastUpdatedAt,
  };
};

export const getDetails: GetDetails = async (
  appContext,
  { client, request },
) => {
  const { transactionReferenceId } = request;

  const allRows = await TransactionModel.findByReferenceId(
    transactionReferenceId,
  );

  if (allRows.length === 0) {
    throw new NotFoundError("Transaction Reference Id was not found");
  }

  if (allRows[0].clientName !== client.clientName) {
    console.warn(
      `Client '${client.clientName}' attempted to get details for transactionReferenceId '${transactionReferenceId}' owned by another client`,
    );
    throw new ForbiddenError(
      "You are not authorized to get details for this transaction.",
    );
  }

  const paymentStatus = derivePaymentStatus(allRows);

  // If the obligation is already resolved (success or failed), the DB is authoritative —
  // no need to hit Pay.gov. Only the pending path fans out to refresh attempts.
  if (paymentStatus !== "pending") {
    const transactions = allRows.map((row) =>
      toTransactionRecordSummary(row, row.transactionStatus),
    );
    return { paymentStatus, transactions };
  }

  return refreshPendingAttempts(appContext, allRows, fee.tcsAppId);
};

const refreshPendingAttempts = async (
  appContext: AppContext,
  allRows: TransactionModel[],
  tcsAppId: string,
): Promise<GetDetailsResponse> => {
  const transactions: TransactionRecordSummary[] = await Promise.all(
    allRows.map(async (row) => {
      if (!row.paygovTrackingId || isTerminal(row.transactionStatus)) {
        return toTransactionRecordSummary(row, row.transactionStatus);
      }

      const req = new GetRequestRequest({
        tcsAppId,
        payGovTrackingId: row.paygovTrackingId,
      });
      try {
        const result = await req.makeSoapRequest(appContext);
        // Return a new summary rather than mutating row.transactionStatus —
        // keeps the input model array immutable for any downstream reader.
        return toTransactionRecordSummary(
          row,
          parseTransactionStatus(result.transaction_status),
        );
      } catch (err) {
        console.error(
          `Failed to refresh status for paygovTrackingId '${row.paygovTrackingId}':`,
          err,
        );
        return toTransactionRecordSummary(row, row.transactionStatus);
      }
    }),
  );

  const paymentStatus = derivePaymentStatus(transactions);

  return { paymentStatus, transactions };
};
