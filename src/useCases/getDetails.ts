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

export type GetDetailsRequest = {
  transactionReferenceId: string;
};

export type GetDetails = (
  appContext: AppContext,
  params: {
    client: ClientPermission;
    request: GetDetailsRequest;
  },
) => Promise<GetDetailsResponse>;

const TERMINAL_STATUSES: ReadonlyArray<TransactionStatus> = ["processed", "failed"];

const isTerminal = (status: TransactionStatus | null | undefined): boolean =>
  status !== null && status !== undefined && TERMINAL_STATUSES.includes(status);

export const getDetails: GetDetails = async (appContext, { client, request }) => {
  const { transactionReferenceId } = request;

  const allRows = await TransactionModel.findByReferenceId(transactionReferenceId);
  if (allRows.length === 0) {
    throw new NotFoundError("Transaction Reference Id was not found");
  }

  const clientRows = allRows.filter((row) => row.clientName === client.clientName);
  if (clientRows.length === 0) {
    console.warn(
      `Client '${client.clientName}' attempted to get details for transactionReferenceId '${transactionReferenceId}' owned by another client`,
    );
    throw new ForbiddenError("You are not authorized to get details for this transaction.");
  }

  // Fee-invariance: all rows for a transactionReferenceId share the same feeId
  const fee = await FeesModel.getFeeById(clientRows[0].feeId);
  if (!fee || !fee.tcsAppId) {
    throw new NotFoundError(`Fee not found for feeId: ${clientRows[0].feeId}`);
  }

  const refreshedRows = await Promise.all(
    clientRows.map(async (row) => {
      if (!row.paygovTrackingId || isTerminal(row.transactionStatus)) {
        return row;
      }

      const req = new GetRequestRequest({
        tcsAppId: fee.tcsAppId!,
        payGovTrackingId: row.paygovTrackingId,
      });
      const result = await req.makeSoapRequest(appContext);
      row.transactionStatus = parseTransactionStatus(result.transaction_status);
      return row;
    }),
  );

  const transactions: TransactionRecordSummary[] = refreshedRows.map((row) => ({
    payGovTrackingId: row.paygovTrackingId ?? undefined,
    transactionStatus: row.transactionStatus ?? "received",
    paymentMethod: toApiPaymentMethod(row.paymentMethod),
    createdTimestamp: row.createdAt,
    updatedTimestamp: row.lastUpdatedAt,
  }));

  const paymentStatus = derivePaymentStatus(transactions.map((t) => t.transactionStatus));

  return { paymentStatus, transactions };
};
