import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Extend Zod with OpenAPI support
extendZodWithOpenApi(z);

export const PaymentMethodSchema = z
  .enum(["Credit/Debit Card", "ACH", "PayPal"])
  .openapi({
    description: "Method of payment",
    example: "Credit/Debit Card",
  });

export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;
