import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { PaymentStatusSchema } from "./PaymentStatus.schema";

// Extend Zod with OpenAPI support
extendZodWithOpenApi(z);

export const DashboardTransactionStatusSchema = z
  .enum(["received", "initiated", "pending", "processed", "failed"])
  .openapi({
    description: "The status of an individual transaction record",
    example: "processed",
  });

export type DashboardTransactionStatus = z.infer<
  typeof DashboardTransactionStatusSchema
>;

export const DashboardPaymentMethodSchema = z
  .enum(['plastic_card', 'ach', 'paypal'])
  .openapi({
    description: "Payment method used for the transaction",
    example: "card",
  });

export type DashboardPaymentMethod = z.infer<typeof DashboardPaymentMethodSchema>;

const IsoDateTimeSchema = z.preprocess(
  (value) => (value instanceof Date ? value.toISOString() : value),
  z.string().datetime(),
);

export const DashboardTransactionSchema = z
  .object({
    agencyTrackingId: z.string().openapi({
      description: "Agency tracking ID for this transaction",
      example: "2f006f54-13a7-4e3d-9dc6-abb53bd4f891",
    }),
    paygovTrackingId: z.string().nullable().optional().openapi({
      description: "Pay.gov tracking ID when available",
      example: "PG-2f006f54-13a7-4e3d-9dc6-abb53bd4f891",
    }),
    feeName: z.string().openapi({
      description: "Human-readable fee name",
      example: "Filing Fee",
    }),
    feeId: z.string().openapi({
      description: "Fee identifier",
      example: "FEE-001",
    }),
    feeAmount: z.number().openapi({
      description: "Fee amount in USD",
      example: 60.5,
    }),
    clientName: z.string().openapi({
      description: "Client application name",
      example: "payment-portal",
    }),
    transactionReferenceId: z.string().openapi({
      description: "Client-specific transaction reference",
      example: "TXREF-00001",
    }),
    paymentStatus: PaymentStatusSchema,
    transactionStatus: DashboardTransactionStatusSchema.nullable().optional(),
    paymentMethod: DashboardPaymentMethodSchema,
    paygovToken: z.string().nullable().optional().openapi({
      description: "Pay.gov token associated with this transaction",
      example: "7f90d8de-e67f-4f8b-a12f-f429b675f2df",
    }),
    metadata: z.record(z.string(), z.string()).nullable().optional().openapi({
      description: "Optional metadata associated with this transaction",
    }),
    createdAt: IsoDateTimeSchema.openapi({
      description: "Record creation timestamp",
      example: "2026-03-06T16:15:10.231Z",
    }),
    lastUpdatedAt: IsoDateTimeSchema.openapi({
      description: "Record last updated timestamp",
      example: "2026-03-09T18:42:56.341Z",
    }),
  })
  .openapi("DashboardTransaction");

export type DashboardTransaction = z.infer<typeof DashboardTransactionSchema>;
