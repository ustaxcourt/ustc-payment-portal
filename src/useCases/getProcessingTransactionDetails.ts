import type { AppContext } from "@appTypes/AppContext";
import { GetRequestRequest } from "@entities/GetDetailsRequest";
import { ConflictError } from "@errors/conflict";
import { PayGovError } from "@errors/payGovError";
import { logError } from "@utils/logError";
import type TransactionModel from "../db/TransactionModel";
import { parseTransactionStatus } from "./parseTransactionStatus";

export const getProcessingTransactionDetails = async (
  appContext: AppContext,
  transaction: TransactionModel,
  tcsAppId: string,
) => {
  if (!transaction.paygovTrackingId) {
    throw new ConflictError(
      ConflictError.PAYMENT_OUTCOME_UNKNOWN_MESSAGE,
    );
  }

  try {
    const result = await new GetRequestRequest({
      tcsAppId,
      payGovTrackingId: transaction.paygovTrackingId,
    }).makeSoapRequest(appContext);
    return {
      result,
      status: parseTransactionStatus(result.transaction_status),
    };
  } catch (err) {
    logError(appContext, "Failed to reconcile Pay.gov payment status", err, {
      agencyTrackingId: transaction.agencyTrackingId,
    });
    throw new PayGovError(
      "Could not confirm the payment outcome with Pay.gov. Please retry the request.",
      502,
    );
  }
};
