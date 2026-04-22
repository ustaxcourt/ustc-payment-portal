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

// Pay.gov's observed wire format varies (e.g. "2026-04-21T15:04:55.362Z" in dev,
// "2016-01-11T16:01:46" in the official example). { local, offset } covers both.
export const CompleteOnlineCollectionWithDetailsResponseSchema = z.object({
  paygov_tracking_id: z.string(),
  agency_tracking_id: z.string(),
  transaction_amount: z.number(),
  transaction_date: z.iso.datetime({ local: true, offset: true }),
  payment_date: z.iso.date(),
  transaction_status: PayGovTransactionStatusSchema,
  payment_type: z.string(),
});

export type CompleteOnlineCollectionWithDetailsResponse = z.infer<
  typeof CompleteOnlineCollectionWithDetailsResponseSchema
>;
