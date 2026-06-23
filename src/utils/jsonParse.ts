import { InvalidRequestError } from "errors/invalidRequest";
import { ParseResult } from "types/ParseResult";

export const jsonParse = <T = any>(
  body: string | null | undefined,
): ParseResult<T> => {
  if (!body) {
    throw new InvalidRequestError("missing body");
  }

  try {
    return { ok: true, value: JSON.parse(body) };
  } catch {
    throw new InvalidRequestError("invalid JSON in request body");
  }
};
