import type {
  PaymentMethod as ApiPaymentMethod,
  DbPaymentMethod,
} from "@schemas/PaymentMethod.schema";

/** Maps a stored value to the label the API returns. Exported as data so SQL can
 *  order by the label without a second copy of the mapping drifting out of sync. */
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

  return PAYMENT_METHOD_LABELS[method];
};

const DB_PAYMENT_METHOD_BY_LABEL: Record<ApiPaymentMethod, DbPaymentMethod> =
  Object.fromEntries(
    Object.entries(PAYMENT_METHOD_LABELS).map(([db, label]) => [label, db]),
  ) as Record<ApiPaymentMethod, DbPaymentMethod>;

/** Reverse of `toApiPaymentMethod`, for filtering by the label a caller sends. */
export const toDbPaymentMethod = (
  method: ApiPaymentMethod | null | undefined,
): DbPaymentMethod | undefined => {
  if (method === null || method === undefined) return undefined;

  return DB_PAYMENT_METHOD_BY_LABEL[method];
};
