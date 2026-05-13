import { handleError } from "./handleError";
import { z } from "zod";
import { PayGovError } from "./errors/payGovError";
import { ServerError } from "./errors/serverError";

const getMockLogger = () => ({
  error: jest.fn(),
});

describe("handleError", () => {
  it("returns the statusCode and message for known client errors (< 500)", () => {
    const logger = getMockLogger();
    const result = handleError(
      { statusCode: 403, message: "Forbidden" },
      logger as any,
    );
    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).message).toBe("Forbidden");
  });

  it("returns 500 with a generic message for known server errors (>= 500)", () => {
    const logger = getMockLogger();
    const result = handleError(
      { statusCode: 500, message: "Something broke" },
      logger as any,
    );
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe(
      "An unexpected error occurred while processing the request",
    );
  });

  it("returns 500 with a generic message for unrecognized errors", () => {
    const logger = getMockLogger();
    const result = handleError(new Error("Unexpected failure"), logger as any);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe(
      "An unexpected error occurred while processing the request",
    );
  });

  it("returns 400 with validation details for ZodErrors", () => {
    const logger = getMockLogger();
    const schema = z.object({ trackingId: z.string() });
    const { error } = schema.safeParse({});

    const result = handleError(error!, logger as any);
    expect(result.statusCode).toBe(400);

    const body = JSON.parse(result.body);
    expect(body.message).toBe("Validation error");
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].path).toContain("trackingId");
  });

  it("returns 504 with Pay.gov error message for PayGovError", () => {
    const logger = getMockLogger();
    const result = handleError(new PayGovError(), logger as any);
    expect(result.statusCode).toBe(504);
    expect(JSON.parse(result.body).message).toBe(
      "Error communicating with Pay.gov",
    );
  });

  describe("logging behavior", () => {
    let defaultLogger: { error: jest.Mock };
    beforeEach(() => {
      defaultLogger = getMockLogger();
      jest.clearAllMocks();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("calls logger.error when handling an error", () => {
      const err = new Error("log me");
      handleError(err, defaultLogger as any);

      expect(defaultLogger.error).toHaveBeenCalledWith(
        { err },
        "responding with an error",
      );
    });

    it("uses provided logger instead of global logger", () => {
      const providedLogger = {
        error: jest.fn(),
      };

      const err = new Error("request scoped");
      handleError(err, providedLogger as any);

      expect(providedLogger.error).toHaveBeenCalledWith(
        { err },
        "responding with an error",
      );
      expect(defaultLogger.error).not.toHaveBeenCalled();
    });
  });
});
