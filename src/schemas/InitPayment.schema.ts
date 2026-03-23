import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { FeeIdSchema } from "./FeeId.schema";
import {
  MetadataDawsonSchema,
  MetadataNonattorneyExamSchema,
  MetadataSchema,
} from "./Metadata.schema";

// Extend Zod with OpenAPI support
extendZodWithOpenApi(z);

const metadataValidators = {
  PETITION_FILING_FEE: MetadataDawsonSchema,
  NONATTORNEY_EXAM_REGISTRATION_FEE: MetadataNonattorneyExamSchema,
} as const;

export const InitPaymentRequestSchema = z
  .object({
    transactionReferenceId: z.uuid().openapi({
      description: "Unique UUID for the transaction reference",
      example: "550e8400-e29b-41d4-a716-446655440000",
    }),
    feeId: FeeIdSchema,
    amount: z.number().positive().optional().openapi({
      description:
        "Override amount in dollars. Only valid for fees that allow variable amounts.",
      example: 60,
    }),
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
  .superRefine((data, ctx) => {
    const result = metadataValidators[data.feeId].safeParse(data.metadata);
    if (!result.success) {
      ctx.addIssue({
        code: "custom",
        message: `Metadata is invalid for feeId "${data.feeId}": ${result.error.issues.map((i) => i.message).join(", ")}`,
        path: ["metadata"],
      });
    }
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
