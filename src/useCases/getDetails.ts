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
import { PayGovError } from "../errors/payGovError";
import { toTransactionRecordSummary } from "../utils/toTransactionRecordSummary";
import { ServerError } from "../errors/serverError";
import { authorizeClient } from "../authorizeClient";

const PAYGOV_RETRY_MESSAGE =
  "There was an error communicating with Pay.gov. Please retry your transaction.";

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
  const { transactionReferenceId } = request;

  appContext.logger.debug("Received getDetails request", {
    transactionReferenceId,
    clientName: client.clientName,
  });

  const allRows = await TransactionModel.findByReferenceId(
    transactionReferenceId,
  );

  if (allRows.length === 0) {
    throw new NotFoundError("Transaction Reference Id was not found");
  }

  const feeId = allRows[0].feeId;

  // Fee-invariance: all rows for a transactionReferenceId share the same feeId.
  const fee = await FeesModel.getFeeById(feeId);
  if (!fee || !fee.tcsAppId) {
    // Both branches indicate server-side data corruption: the FK prevents the first,
    // and tcsAppId is required for any Pay.gov interaction. Neither is a client fault.
    appContext.logger.error("Fee misconfigured — aborting getDetails", {
      transactionReferenceId,
      agencyTrackingId: allRows[0].agencyTrackingId,
      clientName: client.clientName,
      feeId: allRows[0].feeId,
      reason: !fee ? "fee row missing" : "tcsAppId missing",
    });
    throw new ServerError();
  }

  authorizeClient(client, fee.feeKey);

  const paymentStatus = derivePaymentStatus(allRows);

  // If the obligation is already resolved (success or failed), the DB is authoritative —
  // no need to hit Pay.gov. Only the pending path fans out to refresh attempts.
  if (paymentStatus !== "pending") {
    const transactions = allRows.map((row) => toTransactionRecordSummary(row));
    return { paymentStatus, transactions };
  }

  return updatePendingAttemptFromPayGov(appContext, allRows, fee.tcsAppId, client.clientName, fee.feeKey);
};

const updatePendingAttemptFromPayGov = async (
  appContext: AppContext,
  allRows: TransactionModel[],
  tcsAppId: string,
  clientName: string,
  feeKey: string,
): Promise<GetDetailsResponse> => {
  const pendingRows = allRows.filter(
    (row) => row.transactionStatus === "pending",
  );
  if (pendingRows.length > 1) {
    throw new ServerError(
      `More than one pending transaction attempt found for reference ID ${allRows[0].transactionReferenceId}`,
    );
  }

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
        // getDetails is a read — a refresh failure means the source of truth is
        // temporarily unreachable, not that the underlying transaction failed.
        // We surface a retryable error and leave the row's pending state alone.
        appContext.logger.error("Failed to refresh Pay.gov status", {
          transactionReferenceId: row.transactionReferenceId,
          agencyTrackingId: row.agencyTrackingId,
          clientName,
          feeKey,
          metadata: row.metadata ?? undefined,
          paygovTrackingId: row.paygovTrackingId,
          errorName: err instanceof Error ? err.name : undefined,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        throw new PayGovError(PAYGOV_RETRY_MESSAGE, 500);
      }

      appContext.logger.info("Received Pay.gov getDetails response", {
        transactionReferenceId: row.transactionReferenceId,
        agencyTrackingId: row.agencyTrackingId,
        clientName,
        feeKey,
        metadata: row.metadata ?? undefined,
        paygovTrackingId: result.paygov_tracking_id,
        transactionStatus: result.transaction_status,
        paymentType: result.payment_type,
        transactionDate: result.transaction_date,
        paymentDate: result.payment_date,
      });

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
        appContext.logger.info("Transaction updated in DB from Pay.gov response", {
          transactionReferenceId: row.transactionReferenceId,
          agencyTrackingId: row.agencyTrackingId,
          clientName,
          feeKey,
          metadata: row.metadata ?? undefined,
          refreshedTransactionStatus: refreshedStatus,
          paygovTrackingId: result.paygov_tracking_id,
        });
        return toTransactionRecordSummary(updated);
      } catch (err) {
        // We had a fresh status from Pay.gov but couldn't persist it. The row's
        // recorded state is stale, not wrong — a retry will re-fetch and re-persist.
        appContext.logger.error("Failed to persist refreshed Pay.gov status to DB", {
          transactionReferenceId: row.transactionReferenceId,
          agencyTrackingId: row.agencyTrackingId,
          clientName,
          feeKey,
          metadata: row.metadata ?? undefined,
          paygovTrackingId: row.paygovTrackingId,
          errorName: err instanceof Error ? err.name : undefined,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        throw new PayGovError(PAYGOV_RETRY_MESSAGE, 500);
      }
    }),
  );

  const paymentStatus = derivePaymentStatus(transactions);

  return { paymentStatus, transactions };
};
