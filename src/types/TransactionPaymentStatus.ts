import { z } from "zod";
import { TransactionPaymentStatusResponseSchema } from "../schemas/TransactionPaymentStatus.schema";

export type TransactionPaymentStatusResponse = z.infer<
  typeof TransactionPaymentStatusResponseSchema
>;
