import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Extend Zod with OpenAPI support
extendZodWithOpenApi(z);

// Metadata for DAWSON filing fees - requires docket number
export const MetadataDawsonSchema = z
  .object({
    docketNumber: z.string().openapi({
      description: "The docket number for the case (required for DAWSON fees)",
      example: "123-26",
    }),
  })
  .openapi("MetadataDawson");

// Metadata for Non-Attorney Admissions Exam Registration
export const MetadataNonattorneyExamSchema = z
  .object({
    email: z.email().openapi({
      description: "Applicant email address",
      example: "applicant@example.com",
    }),
    fullName: z.string().openapi({
      description: "Applicant full name",
      example: "John Doe",
    }),
    accessCode: z.string().openapi({
      description: "Registration access code",
      example: "ABC123",
    }),
  })
  .openapi("MetadataNonattorneyExam");

// Union of all metadata types for OpenAPI documentation
export const MetadataSchema = z
  .union([MetadataDawsonSchema, MetadataNonattorneyExamSchema])
  .openapi({
    description:
      "Metadata fields are dynamic and determined by the feeId value. " +
      "Different fees require different metadata properties. " +
      "Note: Fee identifiers shown here (e.g., PETITIONS_FILING_FEE, NONATTORNEY_EXAM_REGISTRATION) " +
      "are working names and may be renamed before release. " +
      "See individual metadata schemas for field requirements.",
  });

export type Metadata = z.infer<typeof MetadataSchema>;
