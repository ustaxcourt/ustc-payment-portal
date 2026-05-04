import { ClientPermission } from "../types/ClientPermission";
import { GetRequestRequest } from "../entities/GetDetailsRequest";
import { AppContext } from "../types/AppContext";
import { GetDetailsResponse } from "../schemas/GetDetails.schema";
import { TransactionRecordSummary } from "../schemas/TransactionRecord.schema";
import { TransactionStatus } from "../schemas/TransactionStatus.schema";
import { parseTransactionStatus } from "./parseTransactionStatus";
import {
  derivePaymentStatus,
  derivePaymentStatusFromSingleTransaction,
} from "../utils/derivePaymentStatus";
import { toPaymentMethod } from "../utils/toPaymentMethod";
import TransactionModel from "../db/TransactionModel";
import FeesModel from "../db/FeesModel";
import { NotFoundError } from "../errors/notFound";
import { ServerError } from "../errors/serverError";
import { toTransactionRecordSummary } from "../utils/toTransactionRecordSummary";

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

export const getDetails: GetDetails = async (
  appContext,
  { client, request },
) => {
  // TODO: Remove client param here as unused, update tests.
  const { transactionReferenceId } = request;

  const allRows = await TransactionModel.findByReferenceId(
    transactionReferenceId,
  );

  if (allRows.length === 0) {
    throw new NotFoundError("Transaction Reference Id was not found");
  }

  // Fee-invariance: all rows for a transactionReferenceId share the same feeId.
  const fee = await FeesModel.getFeeById(allRows[0].feeId);
  if (!fee || !fee.tcsAppId) {
    // Both branches indicate server-side data corruption: the FK prevents the first,
    // and tcsAppId is required for any Pay.gov interaction. Neither is a client fault.
    console.error(
      `Fee misconfigured for feeId '${allRows[0].feeId}' on transactionReferenceId '${transactionReferenceId}': ${
        !fee ? "fee row missing" : "tcsAppId missing"
      }`,
    );
    throw new ServerError();
  }

  const paymentStatus = derivePaymentStatus(allRows);

  // If the obligation is already resolved (success or failed), the DB is authoritative —
  // no need to hit Pay.gov. Only the pending path fans out to refresh attempts.
  if (paymentStatus !== "pending") {
    const transactions = allRows.map((row) =>
      toTransactionRecordSummary(row),
    );
    return { paymentStatus, transactions };
  }

  return updatePendingAttemptFromPayGov(appContext, allRows, fee.tcsAppId);
};

const updatePendingAttemptFromPayGov = async (
  appContext: AppContext,
  allRows: TransactionModel[],
  tcsAppId: string,
): Promise<GetDetailsResponse> => {
  const transactions: TransactionRecordSummary[] = await Promise.all(
    allRows.map(async (row) => {
      if (!row.paygovTrackingId || isTerminal(row.transactionStatus)) {
        return toTransactionRecordSummary(row);
      }

      const req = new GetRequestRequest({
        tcsAppId,
        payGovTrackingId: row.paygovTrackingId,
      });
      let refreshedStatus;
      let result;
      try {
        result = await req.makeSoapRequest(appContext);
        refreshedStatus = parseTransactionStatus(result.transaction_status);
      } catch (err) {
        console.error(
          `Failed to refresh status for paygovTrackingId '${row.paygovTrackingId}':`,
          err,
        );
        return toTransactionRecordSummary(row);
      }

      try {
        const updated = await TransactionModel.updateAfterPayGovResponse(
          row.agencyTrackingId,
          result.paygov_tracking_id,
          refreshedStatus,
          derivePaymentStatusFromSingleTransaction(refreshedStatus),
          // Fall back to row.paymentMethod when toPaymentMethod returns null — don't overwrite a valid method on an unrecognized payment_type.
          (result.payment_type ? toPaymentMethod(result.payment_type) : null) ??
            row.paymentMethod ??
            null,
          result.transaction_date,
          result.payment_date,
        );
        return toTransactionRecordSummary(updated);
      } catch (err) {
        // Pay.gov told us the truth; we just couldn't persist it. Return the fresh status anyway —
        // next call will re-poll and retry the write.
        console.error(
          `Failed to persist refreshed status for paygovTrackingId '${row.paygovTrackingId}':`,
          err,
        );
        return { ...toTransactionRecordSummary(row), transactionStatus: refreshedStatus };
      }
    }),
  );

  const paymentStatus = derivePaymentStatus(transactions);

  return { paymentStatus, transactions };
};
