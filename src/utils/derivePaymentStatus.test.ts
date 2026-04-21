import { derivePaymentStatus } from "./derivePaymentStatus";

describe("derivePaymentStatus", () => {
  it('returns "success" when at least one status is processed', () => {
    expect(derivePaymentStatus(["processed"])).toBe("success");
  });

  it('returns "success" when processed appears among failures', () => {
    expect(derivePaymentStatus(["failed", "processed"])).toBe("success");
  });

  it('returns "failed" when all statuses are failed', () => {
    expect(derivePaymentStatus(["failed"])).toBe("failed");
    expect(derivePaymentStatus(["failed", "failed"])).toBe("failed");
  });

  it('returns "pending" when statuses are a mix without processed', () => {
    expect(derivePaymentStatus(["pending", "failed"])).toBe("pending");
    expect(derivePaymentStatus(["received", "failed"])).toBe("pending");
    expect(derivePaymentStatus(["initiated"])).toBe("pending");
  });

  it('returns "pending" for an empty array', () => {
    expect(derivePaymentStatus([])).toBe("pending");
  });
});
