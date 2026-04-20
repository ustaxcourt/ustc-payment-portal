import { AppContext } from "../types/AppContext";
import { CompleteOnlineCollectionWithDetailsRequest } from "../entities/CompleteOnlineCollectionWithDetailsRequest";
import { ProcessPaymentRequest } from "../types/ProcessPaymentRequest";
import { ProcessPaymentResponse } from "../schemas/ProcessPayment.schema";
import { FailedTransactionError } from "../errors/failedTransaction";
import { ForbiddenError } from "../errors/forbidden";
import { GoneError } from "../errors/gone";
import { NotFoundError } from "../errors/notFound";
import { parseTransactionStatus } from "./parseTransactionStatus";
import { derivePaymentStatus } from "./derivePaymentStatus";
import { ClientPermission } from "../types/ClientPermission";
import TransactionModel, {
  PaymentMethod as DbPaymentMethod,
} from "../db/TransactionModel";
import { PaymentMethod as ApiPaymentMethod } from "../schemas/PaymentMethod.schema";

const toApiPaymentMethod = (
  method: DbPaymentMethod | null | undefined,
): ApiPaymentMethod | undefined => {
  switch (method) {
    case "plastic_card":
      return "Credit/Debit Card";
    case "ach":
      return "ACH";
    case "paypal":
      return "PayPal";
    default:
      return undefined;
  }
};

export type ProcessPayment = (
  appContext: AppContext,
  params: {
    client: ClientPermission;
    request: ProcessPaymentRequest;
  },
) => Promise<ProcessPaymentResponse>;

export const processPayment: ProcessPayment = async (
  appContext: AppContext,
  { client, request },
) => {
  const transaction = await TransactionModel.findByPaygovToken(request.token);
  if (!transaction) {
    throw new NotFoundError("Transaction could not be found");
  }

  const hasAccess =
    client.allowedFeeIds.includes("*") ||
    client.allowedFeeIds.includes(transaction.feeId);
  if (!hasAccess) {
    console.warn(
      `Client '${client.clientName}' attempted to process token for feeId '${transaction.feeId}' without access`,
    );
    throw new ForbiddenError(
      `You do not have access to the transaction for the requested token`,
    );
  }

  const sibling = await TransactionModel.findPendingOrProcessedByReferenceId(
    transaction.clientName,
    transaction.transactionReferenceId,
    request.token,
  );

  if (sibling) {
    throw new GoneError(
      "This token is no longer valid. Another transaction is already fulfilling this obligation. Use the getDetails API to check the current status.",
    );
  }

  if (transaction.transactionStatus !== "initiated") {
    throw new GoneError("This token is no longer valid.");
  }

  const req = new CompleteOnlineCollectionWithDetailsRequest({
    tcsAppId: "", // Required by Pay.gov SOAP schema — token alone identifies the transaction on this call
    token: request.token,
  });
  console.log("processPayment request", req);

  try {
    const result = await req.makeSoapRequest(appContext);

    console.log("processPayment result", result);

    const parsedStatus = parseTransactionStatus(result.transaction_status);
    const paymentStatus = derivePaymentStatus([parsedStatus]);

    const updated = await TransactionModel.updateAfterPayGovResponse(
      transaction.agencyTrackingId,
      result.paygov_tracking_id,
      parsedStatus,
      paymentStatus,
    );

    return {
      paymentStatus,
      transactions: [
        {
          transactionStatus: parsedStatus,
          paymentMethod: toApiPaymentMethod(transaction.paymentMethod),
          returnDetail: undefined,
          createdTimestamp: updated.createdAt,
          updatedTimestamp: updated.lastUpdatedAt,
        },
      ],
    };
  } catch (err) {
    if (err instanceof FailedTransactionError) {
      const failed = await TransactionModel.updateToFailed(transaction.agencyTrackingId);

      return {
        paymentStatus: "failed" as const,
        transactions: [
          {
            transactionStatus: "failed" as const,
            paymentMethod: toApiPaymentMethod(transaction.paymentMethod),
            returnDetail: err.message,
            createdTimestamp: failed.createdAt,
            updatedTimestamp: failed.lastUpdatedAt,
          },
        ],
      };
    } else throw err;
  }
};
