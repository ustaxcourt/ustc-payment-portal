import type { z } from "zod";
import type { TransactionPaymentStatusResponseSchema } from "@schemas/TransactionPaymentStatus.schema";

export type TransactionPaymentStatusResponse = z.infer<
	typeof TransactionPaymentStatusResponseSchema
>;
