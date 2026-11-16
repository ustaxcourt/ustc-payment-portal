import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Extend Zod with OpenAPI support
extendZodWithOpenApi(z);

// NOTE: We use 'processed' instead of 'success' here to avoid
// confusion between TransactionStatus and PaymentStatus.
export const TransactionStatusSchema = z
  .enum([
    "received",
    "initiated",
    "processing",
    "processed",
    "failed",
    "pending",
    "cancelled",
  ])
  .openapi({
    description:
      "The status of a single payment transaction attempt. " +
      "`processing` is transient: POST /process has claimed the token and may be calling Pay.gov. " +
      "`pending` usually means Pay.gov is still settling (e.g. ACH). " +
      "`cancelled` means the payer never completed the Pay.gov session and the token " +
      "outlived its TTL; nothing failed, the payment simply never happened. " +
      "`processed` / `failed` / `cancelled` are terminal for the attempt.",
    example: "processed",
  });

export type TransactionStatus = z.infer<typeof TransactionStatusSchema>;
