import { PaymentMethod } from "../db/TransactionModel";

export const toPaymentMethod = (paymentType: string): PaymentMethod | null => {
  switch (paymentType.toUpperCase()) {
    case "PLASTIC_CARD":
      return "plastic_card";
    case "ACH":
      return "ach";
    case "PAYPAL":
      return "paypal";
    default:
      return null;
  }
};
