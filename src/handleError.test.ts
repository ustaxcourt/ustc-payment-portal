import { handleError } from "./handleError";
import { z } from "zod";
import { PayGovError } from "./errors/payGovError";
import { logger } from "./utils/logger";

describe("handleError", () => {
  it("returns the statusCode and message for known client errors (< 500)", () => {
    const result = handleError({ statusCode: 403, message: "Forbidden" });
    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).message).toBe("Forbidden");
  });

  it("returns 500 with a generic message for known server errors (>= 500)", () => {
    const result = handleError({ statusCode: 500, message: "Something broke" });
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe(
      "An unexpected error occurred while processing the request",
    );
  });

  it("returns 500 with a generic message for unrecognized errors", () => {
    const result = handleError(new Error("Unexpected failure"));
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe(
      "An unexpected error occurred while processing the request",
    );
  });

  it("returns 400 with validation details for ZodErrors", () => {
    const schema = z.object({ trackingId: z.string() });
    const { error } = schema.safeParse({});

    const result = handleError(error!);
    expect(result.statusCode).toBe(400);

    const body = JSON.parse(result.body);
    expect(body.message).toBe("Validation error");
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].path).toContain("trackingId");
  });

  it("returns 504 with Pay.gov error message for PayGovError", () => {
    const result = handleError(new PayGovError());
    expect(result.statusCode).toBe(504);
    expect(JSON.parse(result.body).message).toBe(
      "Error communicating with Pay.gov",
    );
  });

  it("calls logger.error when handling an error", () => {
    const errorSpy = jest
      .spyOn(logger, "error")
      .mockImplementation(() => logger as any);

    try {
      const err = new Error("log me");
      handleError(err);

      expect(errorSpy).toHaveBeenCalledWith(
        { err },
        "responding with an error",
      );
    } finally {
      errorSpy.mockRestore();
    }
  });
});
