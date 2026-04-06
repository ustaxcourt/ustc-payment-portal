import { handleError } from "./handleError";
import { PayGovError } from "./errors/payGovError";
import { z } from "zod";

describe("handleError", () => {
  it("returns the statusCode and message for known client errors (< 500)", () => {
    const result = handleError({ statusCode: 403, message: "Forbidden" });
    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).message).toBe("Forbidden");
  });

  it("returns 500 with a generic message for unhandled server errors — does not leak internal messages", () => {
    const result = handleError({ statusCode: 500, message: "Something broke" });
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe("An unexpected error occurred");
  });

  it("returns 504 for PayGovError instances with the Pay.gov message", () => {
    const result = handleError(new PayGovError("Failed to communicate with Pay.gov"));
    expect(result.statusCode).toBe(504);
    expect(JSON.parse(result.body).message).toBe("Failed to communicate with Pay.gov");
  });

  it("returns 500 with a generic message for unrecognized errors", () => {
    const result = handleError(new Error("Unexpected failure"));
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe("An unexpected error occurred");
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
});
