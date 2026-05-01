import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { PaymentStatusSchema } from "./PaymentStatus.schema";
import { TransactionRecordSummarySchema } from "./TransactionRecord.schema";

// Extend Zod with OpenAPI support
extendZodWithOpenApi(z);

export const GetDetailsPathParamsSchema = z
  .object({
    transactionReferenceId: z.uuidv4().openapi({
      description:
        "Client-generated UUIDv4 uniquely identifying the transaction. " +
        "Must match the value supplied to /init.",
      example: "550e8400-e29b-41d4-a716-446655440000",
    }),
  })
  .strict()
  .openapi("GetDetailsPathParams");

export type GetDetailsPathParams = z.infer<typeof GetDetailsPathParamsSchema>;

export const GetDetailsResponseSchema = z
  .object({
    paymentStatus: PaymentStatusSchema.openapi({
      description:
        "Overall payment status representing the current state of the payment",
    }),
    transactions: z.array(TransactionRecordSummarySchema).openapi({
      description:
        "Array of all transaction records associated with this payment reference",
    }),
  })
  .openapi("GetDetailsResponse");

export type GetDetailsResponse = z.infer<typeof GetDetailsResponseSchema>;
