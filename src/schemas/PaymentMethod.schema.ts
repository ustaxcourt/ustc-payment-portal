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

/** The stored value for each `PaymentMethod` label; see `PAYMENT_METHOD_LABELS`
 *  in `toApiPaymentMethod.ts` for the pairing between the two. */
export const DbPaymentMethodSchema = z.enum(["plastic_card", "ach", "paypal"]);

export type DbPaymentMethod = z.infer<typeof DbPaymentMethodSchema>;
