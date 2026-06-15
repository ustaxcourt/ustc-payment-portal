import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { FEES } from "../fees";

// Extend Zod with OpenAPI support
extendZodWithOpenApi(z);

const feeIds = Object.keys(FEES) as [string, ...string[]];

export const FeeIdSchema = z
  .enum(feeIds)
  .openapi({
    description:
      "The versioned fee identifier stored on a transaction. Matches the feeId active at the time the transaction was initiated.\n\n" +
      "Fee amounts are determined by the Payment Portal based on the fee key. " +
      "See the API documentation for more details on fee authorization and supported fees.",
    example: "PETITION_FILING_FEE",
  });

export type FeeId = z.infer<typeof FeeIdSchema>;
