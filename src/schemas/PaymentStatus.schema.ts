import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Extend Zod with OpenAPI support
extendZodWithOpenApi(z);

export const PaymentStatusSchema = z
  .enum(["success", "failed", "pending"])
  .openapi({
    description: "The overall status of the payment",
    example: "success",
  });

export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;
