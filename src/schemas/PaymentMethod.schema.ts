import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Extend Zod with OpenAPI support
extendZodWithOpenApi(z);

export const PaymentMethodSchema = z
  .enum(["plastic_card", "ach", "paypal"])
  .openapi({
    description: "Method of payment",
    example: "plastic_card",
  });

export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;
