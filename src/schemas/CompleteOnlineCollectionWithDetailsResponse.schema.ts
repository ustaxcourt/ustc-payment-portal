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

// Pay.gov returns timestamps without a trailing timezone (e.g. "2016-01-11T16:01:46"),
// which z.iso.datetime() rejects. Match Pay.gov's documented format explicitly so we
// fail fast at the SOAP boundary rather than persisting a malformed value to the DB.
const PayGovLocalDateTime = z.string().regex(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/,
  "transaction_date must match Pay.gov's YYYY-MM-DDTHH:mm:ss format",
);

const PayGovDate = z.string().regex(
  /^\d{4}-\d{2}-\d{2}$/,
  "payment_date must match Pay.gov's YYYY-MM-DD format",
);

export const CompleteOnlineCollectionWithDetailsResponseSchema = z.object({
  paygov_tracking_id: z.string(),
  agency_tracking_id: z.string(),
  transaction_amount: z.number(),
  transaction_date: PayGovLocalDateTime,
  payment_date: PayGovDate,
  transaction_status: PayGovTransactionStatusSchema,
  payment_type: z.string(),
});

export type CompleteOnlineCollectionWithDetailsResponse = z.infer<
  typeof CompleteOnlineCollectionWithDetailsResponseSchema
>;
