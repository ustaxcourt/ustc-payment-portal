import { AppContext } from "../types/AppContext";
import { CompleteOnlineCollectionWithDetailsRequest } from "../entities/CompleteOnlineCollectionWithDetailsRequest";
import { ProcessPaymentRequest } from "../types/ProcessPaymentRequest";
import { ProcessPaymentResponse } from "../schemas/ProcessPayment.schema";
import { FailedTransactionError } from "../errors/failedTransaction";
import { ForbiddenError } from "../errors/forbidden";
import { NotFoundError } from "../errors/notFound";
import { parseTransactionStatus } from "./parseTransactionStatus";
import { derivePaymentStatus } from "./derivePaymentStatus";
import { ClientPermission } from "../types/ClientPermission";
import TransactionModel, {
  TransactionStatus,
  PaymentMethod as DbPaymentMethod,
} from "../db/TransactionModel";
import { TransactionStatus as ApiTransactionStatus } from "../schemas/TransactionStatus.schema";
import { PaymentMethod as ApiPaymentMethod } from "../schemas/PaymentMethod.schema";

const toDbTransactionStatus = (parsed: ApiTransactionStatus): TransactionStatus => {
  switch (parsed) {
    case "Success":
      return "processed";
    case "Failed":
      return "failed";
    case "Pending":
      return "pending";
    case "Received":
      return "received";
    case "Initiated":
      return "initiated";
  }
};

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

    await TransactionModel.updateToProcessed(
      transaction.agencyTrackingId,
      result.paygov_tracking_id,
      toDbTransactionStatus(parsedStatus),
      paymentStatus,
    );

    return {
      paymentStatus,
      transactions: [
        {
          transactionStatus: parsedStatus,
          paymentMethod: toApiPaymentMethod(transaction.paymentMethod),
          returnDetail: undefined,
          createdTimestamp: transaction.createdAt,
          updatedTimestamp: transaction.lastUpdatedAt,
        },
      ],
    };
  } catch (err) {
    if (err instanceof FailedTransactionError) {
      await TransactionModel.updateToFailed(transaction.agencyTrackingId);

      return {
        paymentStatus: "failed" as const,
        transactions: [
          {
            transactionStatus: "Failed" as const,
            paymentMethod: toApiPaymentMethod(transaction.paymentMethod),
            returnDetail: err.message,
            createdTimestamp: transaction.createdAt,
            updatedTimestamp: transaction.lastUpdatedAt,
          },
        ],
      };
    } else throw err;
  }
};
