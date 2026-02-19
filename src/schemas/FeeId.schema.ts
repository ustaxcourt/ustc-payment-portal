import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Extend Zod with OpenAPI support
extendZodWithOpenApi(z);

export const FeeIdSchema = z
  .enum(["PETITIONS_FILING_FEE", "NONATTORNEY_EXAM_REGISTRATION"])
  .openapi({
    description: "The fee type identifier",
    example: "PETITIONS_FILING_FEE",
  });

export type FeeId = z.infer<typeof FeeIdSchema>;
