import { z } from "zod";
import { PayGovTransactionStatusSchema } from "./CompleteOnlineCollectionWithDetailsResponse.schema";

// Validate only the fields the getDetails use case actually consumes. Pay.gov's
// real responses include agency_tracking_id and transaction_amount, but the dev
// fake omits them and we don't read them downstream (the DB row already has them).
// Strictness here would buy nothing and only break against the dev fake.
export const PayGovGetDetailsTransactionSchema = z.object({
	paygov_tracking_id: z.string(),
	transaction_status: PayGovTransactionStatusSchema,
	agency_tracking_id: z.string().optional(),
	transaction_amount: z.number().optional(),
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
