import type { Request } from "express";
import { ZodType } from "zod";
import { InvalidRequestError } from "./errors/invalidRequest";

/**
 * Mirrors lambdaHandler.ts's parseAndValidate so the dev server produces the
 * same error responses as the deployed Lambda for the same inputs.
 *
 * express.json() leaves req.body as `{}` when the request had no JSON
 * content-type, which is how we detect "missing body" here. Throws so the
 * caller's existing try/catch can route the error through handleError.
 */
export const parseRequestBody = <T>(
  req: Pick<Request, "body" | "headers">,
  schema: ZodType<T>,
): T => {
  const isJsonRequest =
    req.headers["content-type"]?.includes("application/json") ?? false;
  if (!isJsonRequest && Object.keys(req.body ?? {}).length === 0) {
    throw new InvalidRequestError("missing body");
  }
  return schema.parse(req.body);
};
