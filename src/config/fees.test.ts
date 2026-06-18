import { getAllFees, getFeeById, getActiveFeeByKey } from "./fees";

describe("fees config", () => {
  describe("getAllFees", () => {
    it("returns all fees sorted by activationDate desc", () => {
      const all = getAllFees();
      expect(all.length).toBeGreaterThan(0);
      for (let i = 0; i < all.length - 1; i++) {
        expect(all[i].activationDate >= all[i + 1].activationDate).toBe(true);
      }
    });
  });

  describe("getFeeById", () => {
    it("returns undefined if feeId not found", () => {
      expect(getFeeById("NOT_EXISTING")).toBeUndefined();
    });

    it("returns active fee properties by feeId", () => {
      const fee = getFeeById("PETITION_FILING_FEE");
      expect(fee).toBeDefined();
      expect(fee?.feeId).toBe("PETITION_FILING_FEE");
    });
  });

  describe("getActiveFeeByKey", () => {
    it("returns undefined if key does not exist", () => {
      expect(getActiveFeeByKey("NOT_EXISTING")).toBeUndefined();
    });

    it("returns active fee version based on key and activationDate", () => {
      const fee = getActiveFeeByKey("PETITION_FILING_FEE", "2026-04-01T00:00:00Z");
      expect(fee).toBeDefined();
      expect(fee?.feeKey).toBe("PETITION_FILING_FEE");
    });

    it("returns undefined if activationDate is before any version launch", () => {
      const fee = getActiveFeeByKey("PETITION_FILING_FEE", "2020-01-01T00:00:00Z");
      expect(fee).toBeUndefined();
    });
  });
});
