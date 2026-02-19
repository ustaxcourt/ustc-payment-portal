import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Extend Zod with OpenAPI support
extendZodWithOpenApi(z);

export const TransactionStatusSchema = z
  .enum(["Received", "Initiated", "Success", "Failed", "Pending"])
  .openapi({
    description: "The status of the payment transaction",
    example: "Success",
  });

export type TransactionStatus = z.infer<typeof TransactionStatusSchema>;
