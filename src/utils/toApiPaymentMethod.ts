import { PaymentMethod as DbPaymentMethod } from "../db/TransactionModel";
import { PaymentMethod as ApiPaymentMethod } from "../schemas/PaymentMethod.schema";

export const toApiPaymentMethod = (
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
