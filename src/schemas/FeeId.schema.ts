import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Extend Zod with OpenAPI support
extendZodWithOpenApi(z);

export const FeeIdSchema = z
  .enum(["PETITION_FILING_FEE", "NONATTORNEY_EXAM_REGISTRATION_FEE"])
  .openapi({
    description: "The fee type identifier",
    example: "PETITION_FILING_FEE",
  });

export type FeeId = z.infer<typeof FeeIdSchema>;
