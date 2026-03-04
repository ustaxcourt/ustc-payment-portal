import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Extend Zod with OpenAPI support
extendZodWithOpenApi(z);

export const FeeIdSchema = z
  .enum(["PETITION_FILING_FEE", "NONATTORNEY_EXAM_REGISTRATION_FEE"])
  .openapi({
    description:
      "The fee type identifier. Available fee types:\n\n" +
      "- `PETITION_FILING_FEE`: Filing fee for petitions in DAWSON ($60)\n" +
      "- `NONATTORNEY_EXAM_REGISTRATION`: Registration fee for nonattorney examination\n\n" +
      "Fee amounts are determined by the Payment Portal based on the fee type. " +
      "See the API documentation for more details on fee authorization and supported fees.",
    example: "PETITION_FILING_FEE",
  });

export type FeeId = z.infer<typeof FeeIdSchema>;
