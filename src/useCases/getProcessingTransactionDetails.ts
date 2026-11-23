import type { AppContext } from "@appTypes/AppContext";
import { GetRequestRequest } from "@entities/GetDetailsRequest";
import { ConflictError } from "@errors/conflict";
import { PayGovError } from "@errors/payGovError";
import { logError } from "@utils/logError";
import type TransactionModel from "../db/TransactionModel";
import { writeEmf } from "../health/emf";
import { parseTransactionStatus } from "./parseTransactionStatus";

export const getProcessingTransactionDetails = async (
  appContext: AppContext,
  transaction: TransactionModel,
  tcsAppId: string,
) => {
  if (!transaction.paygovTrackingId) {
    writeEmf(
      [{ Name: "PaymentOutcomeUnknown", Unit: "Count" }],
      { PaymentOutcomeUnknown: 1 },
    );
    appContext.logger.warn("Payment outcome unknown: missing Pay.gov tracking ID", {
      agencyTrackingId: transaction.agencyTrackingId,
    });
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
