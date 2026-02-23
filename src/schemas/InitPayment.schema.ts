import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { FeeIdSchema } from "./FeeId.schema";
import { MetadataSchema } from "./Metadata.schema";

// Extend Zod with OpenAPI support
extendZodWithOpenApi(z);

export const InitPaymentRequestSchema = z
  .object({
    appId: z.string().openapi({
      description: "The application ID",
      example: "DAWSON",
    }),
    transactionReferenceId: z.uuid().openapi({
      description: "Unique UUID for the transaction reference",
      example: "550e8400-e29b-41d4-a716-446655440000",
    }),
    feeId: FeeIdSchema,
    urlSuccess: z.url().openapi({
      description: "URL to redirect to after successful payment",
      example: "https://client.app/success",
    }),
    urlCancel: z.url().openapi({
      description: "URL to redirect to if payment is cancelled",
      example: "https://client.app/cancel",
    }),
    metadata: MetadataSchema,
  })
  .openapi("InitPaymentRequest");

export type InitPaymentRequest = z.infer<typeof InitPaymentRequestSchema>;

export const InitPaymentResponseSchema = z
  .object({
    token: z.string().openapi({
      description: "Payment token for the initiated transaction",
      example: "abc123token",
    }),
    paymentRedirect: z.url().openapi({
      description: "URL to redirect the user to complete payment on Pay.gov",
      example: "https://pay.gov/payment?token=abc123token&tcsAppID=USTC_APP",
    }),
  })
  .openapi("InitPaymentResponse");

export type InitPaymentResponse = z.infer<typeof InitPaymentResponseSchema>;
