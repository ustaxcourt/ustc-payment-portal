import type { APIGatewayEvent, APIGatewayProxyResult } from "aws-lambda";
import { lambdaHandler } from "./lambdaHandler";
import { ValidateClientRequestSchema } from "@schemas/ValidateClient.schema";
import { validateClient } from "@useCases/validateClient";

/**
 * GET /validate-client — pre-golive credential check for a newly registered client.
 *
 * The request carries nothing: the caller is identified entirely by the SigV4
 * signature, so `rawRequest` is a literal empty object.
 */
export const validateClientHandler = (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> => {
  return lambdaHandler({
    schema: ValidateClientRequestSchema,
    event,
    rawRequest: "{}",
    callback: validateClient,
  });
};
