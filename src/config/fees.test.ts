import { getAllFees, getActiveFee } from "./fees";

describe("fees config", () => {
  describe("getAllFees", () => {
    it("returns every fee definition declared in staticFees", () => {
      const all = getAllFees();
      expect(all.length).toBeGreaterThan(0);
      for (const fee of all) {
        expect(fee.name).toBeTruthy();
        expect(fee.tcsAppId).toBeTruthy();
        expect(fee.versions.length).toBeGreaterThan(0);
      }
    });
  });

  describe("getActiveFee", () => {
    it("returns undefined if the fee key does not exist", () => {
      expect(getActiveFee("NOT_EXISTING")).toBeUndefined();
    });

    it("returns the active version merged with the definition and echoes the key back as fee", () => {
      const fee = getActiveFee("PETITION_FILING_FEE", "2026-04-01T00:00:00Z");
      expect(fee).toBeDefined();
      expect(fee?.fee).toBe("PETITION_FILING_FEE");
      expect(fee?.tcsAppId).toBe("TCSUSTAXCOURTPETITION");
      expect(fee?.amount).toBe(60);
      expect(fee?.isVariable).toBe(false);
    });

    it("returns undefined when the requested date precedes every activation", () => {
      const fee = getActiveFee("PETITION_FILING_FEE", "2020-01-01T00:00:00Z");
      expect(fee).toBeUndefined();
    });
  });
});
