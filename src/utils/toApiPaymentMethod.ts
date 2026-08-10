import type { PaymentMethod as DbPaymentMethod } from "../db/TransactionModel";
import type { PaymentMethod as ApiPaymentMethod } from "@schemas/PaymentMethod.schema";

/**
 * Maps a stored value to the label the API returns. Exported as data rather than kept
 * inside the function so SQL can order by the label without a second copy of
 * the mapping drifting out of sync. The `Record` makes a missing method a
 * compile error if `DbPaymentMethod` gains a member.
 */
export const PAYMENT_METHOD_LABELS: Record<DbPaymentMethod, ApiPaymentMethod> =
  {
    plastic_card: "Credit/Debit Card",
    ach: "ACH",
    paypal: "PayPal",
  };

export const toApiPaymentMethod = (
  method: DbPaymentMethod | null | undefined,
): ApiPaymentMethod | undefined => {
  if (method === null || method === undefined) return undefined;

  const label = PAYMENT_METHOD_LABELS[method];
  if (label === undefined) {
    // Reachable only if the column holds a value outside the union.
    throw new Error(`Unknown payment method: ${method as string}`);
  }
  return label;
};
