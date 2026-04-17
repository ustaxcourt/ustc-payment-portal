import { derivePaymentStatus } from "./derivePaymentStatus";

describe("derivePaymentStatus", () => {
  it('returns "success" when at least one status is Success', () => {
    expect(derivePaymentStatus(["Success"])).toBe("success");
  });

  it('returns "success" when Success appears among failures', () => {
    expect(derivePaymentStatus(["Failed", "Success"])).toBe("success");
  });

  it('returns "failed" when all statuses are Failed', () => {
    expect(derivePaymentStatus(["Failed"])).toBe("failed");
    expect(derivePaymentStatus(["Failed", "Failed"])).toBe("failed");
  });

  it('returns "pending" when statuses are a mix without Success', () => {
    expect(derivePaymentStatus(["Pending", "Failed"])).toBe("pending");
    expect(derivePaymentStatus(["Received", "Failed"])).toBe("pending");
    expect(derivePaymentStatus(["Initiated"])).toBe("pending");
  });

  it('returns "pending" for an empty array', () => {
    expect(derivePaymentStatus([])).toBe("pending");
  });
});
