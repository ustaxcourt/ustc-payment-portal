import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { TransactionStatusSchema } from "./TransactionStatus.schema";
import { TransactionRecordSchema } from "./TransactionRecord.schema";

// Extend Zod with OpenAPI support
extendZodWithOpenApi(z);

export const GetDetailsResponseSchema = z
  .object({
    paymentStatus: TransactionStatusSchema.openapi({
      description:
        "Overall payment status representing the current state of the payment",
    }),
    transactions: z.array(TransactionRecordSchema).openapi({
      description:
        "Array of all transaction records associated with this payment reference",
    }),
  })
  .openapi("GetDetailsResponse");

export type GetDetailsResponse = z.infer<typeof GetDetailsResponseSchema>;
