import { z } from "zod";
import { parseAndValidate } from "./parseAndValidate";
import { InvalidRequestError } from "../errors/invalidRequest";

describe("parseAndValidate", () => {
  const schema = z.object({
    token: z.string().min(1),
    amount: z.number().positive(),
  });

  it("returns typed validated data for a valid body", () => {
    const body = JSON.stringify({ token: "abc123", amount: 100 });

    const result = parseAndValidate(body, schema);

    expect(result).toEqual({
      ok: true,
      value: { token: "abc123", amount: 100 },
    });
  });

  it("throws InvalidRequestError when JSON is invalid", () => {
    expect(() => parseAndValidate("not-json", schema)).toThrow(
      InvalidRequestError,
    );
    expect(() => parseAndValidate("not-json", schema)).toThrow(
      "invalid JSON in request body",
    );
  });

  it("throws InvalidRequestError when schema validation fails", () => {
    const body = JSON.stringify({ token: "", amount: -1 });

    expect(() => parseAndValidate(body, schema)).toThrow(InvalidRequestError);
    expect(() => parseAndValidate(body, schema)).toThrow(
      "Request body failed schema validation",
    );
  });

  it("throws InvalidRequestError when body is missing", () => {
    expect(() => parseAndValidate(null, schema)).toThrow(InvalidRequestError);
    expect(() => parseAndValidate(null, schema)).toThrow("missing body");
  });
});
