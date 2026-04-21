import { PaymentMethod as DbPaymentMethod } from "../db/TransactionModel";
import { PaymentMethod as ApiPaymentMethod } from "../schemas/PaymentMethod.schema";

export const toApiPaymentMethod = (
  method: DbPaymentMethod | null | undefined,
): ApiPaymentMethod | undefined => {
  if (method === null || method === undefined) return undefined;
  switch (method) {
    case "plastic_card":
      return "Credit/Debit Card";
    case "ach":
      return "ACH";
    case "paypal":
      return "PayPal";
    default: {
      const _exhaustive: never = method;
      throw new Error(`Unknown payment method: ${_exhaustive as string}`);
    }
  }
};
