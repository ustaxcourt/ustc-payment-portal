import type { TransactionPaymentStatusResponseSchema } from "@schemas/TransactionPaymentStatus.schema";
import type { z } from "zod";

export type TransactionPaymentStatusResponse = z.infer<
	typeof TransactionPaymentStatusResponseSchema
>;
