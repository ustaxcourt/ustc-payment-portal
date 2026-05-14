import { z } from "zod";
import { PayGovTransactionStatusSchema } from "./CompleteOnlineCollectionWithDetailsResponse.schema";

export const PayGovGetDetailsTransactionSchema = z.object({
  paygov_tracking_id: z.string(),
  agency_tracking_id: z.string(),
  // fast-xml-parser coerces numeric leaf values to numbers by default
  // (xmlOptions.ts overrides only ignoreAttributes / format / trimValues).
  transaction_amount: z.number(),
  transaction_status: PayGovTransactionStatusSchema,
  payment_type: z.string().optional(),
  transaction_date: z.iso.datetime({ local: true, offset: true }).optional(),
  payment_date: z.iso.date().optional(),
});

const TransactionWrapperSchema = z.object({
  transaction: PayGovGetDetailsTransactionSchema,
});

export const PayGovGetDetailsResponseSchema = z.object({
  transactions: z.union([
    TransactionWrapperSchema,
    z.array(TransactionWrapperSchema).nonempty(),
  ]),
});

export type PayGovGetDetailsTransaction = z.infer<
  typeof PayGovGetDetailsTransactionSchema
>;
export type PayGovGetDetailsResponseBody = z.infer<
  typeof PayGovGetDetailsResponseSchema
>;
