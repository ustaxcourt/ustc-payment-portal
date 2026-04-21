import { z } from "zod";

export const PayGovTransactionStatusSchema = z.enum([
  "Success",
  "Settled",
  "Cancelled",
  "Failed",
  "Retired",
  "Pending",
  "Received",
  "Waiting",
  "Submitted",
]);

export const CompleteOnlineCollectionWithDetailsResponseSchema = z.object({
  paygov_tracking_id: z.string(),
  agency_tracking_id: z.string(),
  transaction_amount: z.number(),
  transaction_date: z.string(),
  payment_date: z.string(),
  transaction_status: PayGovTransactionStatusSchema,
  payment_type: z.string(),
});

export type CompleteOnlineCollectionWithDetailsResponse = z.infer<
  typeof CompleteOnlineCollectionWithDetailsResponseSchema
>;
