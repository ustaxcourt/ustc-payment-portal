import { getAllFees, getActiveFee } from "./fees";
import { FeeConfigurationError } from "@errors/feeConfiguration";

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
    it("throws FeeConfigurationError if the fee key does not exist", () => {
      expect(() => getActiveFee("NOT_EXISTING")).toThrow(
        new FeeConfigurationError("NOT_EXISTING"),
      );
    });

    it("returns the active version merged with the definition and echoes the key back as fee", () => {
      const fee = getActiveFee("PETITION_FILING_FEE", "2026-04-01T00:00:00Z");
      expect(fee).toBeDefined();
      expect(fee?.fee).toBe("PETITION_FILING_FEE");
      expect(fee?.tcsAppId).toBe("TCSUSTAXCOURTPETITION");
      expect(fee?.amount).toBe(60);
      expect(fee?.isVariable).toBe(false);
    });

    it("throws FeeConfigurationError when the requested date precedes every activation", () => {
      expect(() =>
        getActiveFee("PETITION_FILING_FEE", "2020-01-01T00:00:00Z"),
      ).toThrow(new FeeConfigurationError("PETITION_FILING_FEE"));
    });

    it("throws FeeConfigurationError when the requested date is invalid", () => {
      expect(() => getActiveFee("PETITION_FILING_FEE", "not-a-date")).toThrow(
        new FeeConfigurationError("PETITION_FILING_FEE"),
      );
    });
  });
});
