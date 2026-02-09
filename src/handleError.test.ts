import { UnauthorizedError } from "./errors/unauthorized";
import { handleError } from "./handleError";
import { z } from "zod";

describe("handleError", () => {
  it("returns an object with the statusCode if the statusCode is set and less than 500", () => {
    const error = {
      statusCode: 403,
      message: "You are not authorized to view this test",
    };
    expect(handleError(error)).toMatchObject({
      statusCode: 403,
      body: "You are not authorized to view this test",
    });
  });

  it("re-throws the error if statusCode is set and greater than 500", () => {
    let result;
    try {
      result = handleError({
        statusCode: 500,
        message: "Something broke",
      });
    } catch (err) {
      expect(err).toMatchObject({
        statusCode: 500,
        message: "Something broke",
      });
    }
    expect(result).toBeUndefined();
  });

  it("returns a 400 error if the error is a ZodError", () => {
    // Generate a real ZodError by parsing invalid data
    const schema = z.object({ trackingId: z.string() });
    let zodError: z.ZodError | undefined;
    try {
      schema.parse({}); // missing trackingId
    } catch (e) {
      zodError = e as z.ZodError;
    }

    expect(zodError).toBeDefined();
    const result = handleError(zodError);
    expect(result).toMatchObject({
      statusCode: 400,
    });
    const body = JSON.parse(result.body);
    expect(body.message).toBe("Validation error");
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].path).toContain("trackingId");
  });
});
