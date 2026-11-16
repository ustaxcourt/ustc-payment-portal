import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Extend Zod with OpenAPI support
extendZodWithOpenApi(z);

/**
 * GET /validate-client takes no body and no path or query parameters. The schema
 * exists to satisfy `lambdaHandler`'s generic and its `parseAndValidate` contract;
 * the handler always feeds it an empty object.
 */
export const ValidateClientRequestSchema = z
  .object({})
  .openapi("ValidateClientRequest");

export type ValidateClientRequest = z.infer<typeof ValidateClientRequestSchema>;

export const ValidateClientResponseSchema = z
  .object({
    clientName: z.string().openapi({
      description:
        "Display name of the registered client, resolved from the client-permissions secret " +
        "using the IAM role ARN the request was signed with.",
      example: "DAWSON",
    }),
    // Deliberately z.string() rather than FeeKeySchema: this is the raw registered
    // set, and confirming those values are real fee keys is what the endpoint is for.
    // Constraining the type here would make an invalid registration unrepresentable.
    allowedFeeKeys: z.array(z.string()).openapi({
      description:
        "Every fee key registered to this client in the client-permissions secret.",
      example: ["PETITION_FILING_FEE", "NONATTORNEY_EXAM_REGISTRATION_FEE"],
    }),
  })
  .openapi("ValidateClientResponse");

export type ValidateClientResponse = z.infer<
  typeof ValidateClientResponseSchema
>;
