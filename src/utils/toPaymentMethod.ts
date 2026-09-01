import type { DbPaymentMethod } from "@schemas/PaymentMethod.schema";

export const toPaymentMethod = (
  paymentType: string,
): DbPaymentMethod | null => {
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
