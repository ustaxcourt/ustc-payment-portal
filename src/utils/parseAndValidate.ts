import { ZodType } from "zod";
import type { ParseResult } from "@appTypes/ParseResult";
import { jsonParse } from "./jsonParse";

/**
 * Parses a JSON body and validates it against a Zod schema.
 * Returns the typed, validated value.
 */
export const parseAndValidate = <T>(
  body: string | null | undefined,
  schema: ZodType<T>,
): ParseResult<T> => {
  const parsed = jsonParse(body);

  const result = schema.safeParse(parsed.value);
  if (!result.success) {
    throw result.error;
  }

  return { ok: true, value: result.data };
};

