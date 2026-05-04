import { z, ZodError } from "zod";
import { parseRequestBody } from "./parseRequestBody";
import { InvalidRequestError } from "./errors/invalidRequest";

const TestSchema = z.object({
  token: z.string().min(1),
});

const buildReq = (
  body: unknown,
  contentType?: string,
): Parameters<typeof parseRequestBody>[0] => ({
  body,
  headers: contentType ? { "content-type": contentType } : {},
});

describe("parseRequestBody", () => {
  it("returns the parsed value when body is valid JSON matching the schema", () => {
    const req = buildReq({ token: "abc" }, "application/json");

    const result = parseRequestBody(req, TestSchema);

    expect(result).toEqual({ token: "abc" });
  });

  it("throws InvalidRequestError('missing body') when no JSON content-type and body is empty", () => {
    // Mirrors what express.json() leaves behind when no content-type is sent:
    // req.body defaults to {} and the request never reached the JSON parser.
    const req = buildReq({});

    expect(() => parseRequestBody(req, TestSchema)).toThrow(InvalidRequestError);
    expect(() => parseRequestBody(req, TestSchema)).toThrow("missing body");
  });

  it("throws ZodError when the body has the JSON content-type but fails schema validation", () => {
    // Empty {} with content-type: application/json is the integration-test case —
    // it must produce a Zod validation error (mapped to 400 'Validation error'
    // by handleError) rather than 'missing body', to match the Lambda handler.
    const req = buildReq({}, "application/json");

    expect(() => parseRequestBody(req, TestSchema)).toThrow(ZodError);
  });
});
