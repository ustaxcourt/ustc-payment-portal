import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Extend Zod with OpenAPI support
extendZodWithOpenApi(z);

// NOTE: We use 'processed' instead of 'success' here to avoid
// confusioon between TransactionStatus and PaymentStatus.
export const TransactionStatusSchema = z
  .enum(["received", "initiated", "processed", "failed", "pending"])
  .openapi({
    description: "The status of the payment transaction",
    example: "processed",
  });

export type TransactionStatus = z.infer<typeof TransactionStatusSchema>;
