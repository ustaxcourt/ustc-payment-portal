import { FeeConfigurationError } from "@errors/feeConfiguration";
import { FeeNotFoundError } from "@errors/feeNotFound";
import { getActiveFee, getAllFees, staticFees } from "./fees";

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
    afterEach(() => {
      delete staticFees.TEST_FEE;
    });

    it("throws FeeNotFoundError if the fee key does not exist", () => {
      expect(() => getActiveFee("NOT_EXISTING")).toThrow(
        new FeeNotFoundError("NOT_EXISTING"),
      );
    });

    it("returns the active version merged with the definition and echoes the key back as fee", () => {
      const fee = getActiveFee("PETITION_FILING_FEE", "2026-04-01T00:00:00Z");
      expect(fee).toBeDefined();
      expect(fee?.fee).toBe("PETITION_FILING_FEE");
      expect(fee?.tcsAppId).toBe("TCSUSTAXCOURTANAEF"); // TODO: This is a placeholder value; the actual TCS app ID is TBD
      expect(fee?.amount).toBe(60);
      expect(fee?.isVariable).toBe(false);
    });

    it("accepts a Date object for the resolution date", () => {
      const fee = getActiveFee(
        "PETITION_FILING_FEE",
        new Date("2026-04-01T00:00:00Z"),
      );
      expect(fee.amount).toBe(60);
    });

    it("throws FeeNotFoundError when the requested date precedes every activation", () => {
      expect(() =>
        getActiveFee("PETITION_FILING_FEE", "2020-01-01T00:00:00Z"),
      ).toThrow(
        new FeeNotFoundError("PETITION_FILING_FEE", "2020-01-01T00:00:00Z"),
      );
    });

    it("throws FeeNotFoundError when the requested date is invalid", () => {
      expect(() => getActiveFee("PETITION_FILING_FEE", "not-a-date")).toThrow(
        new FeeNotFoundError("PETITION_FILING_FEE", "not-a-date"),
      );
    });

    it("throws FeeConfigurationError when tcsAppId is missing", () => {
      staticFees.TEST_FEE = {
        name: "Test Fee",
        tcsAppId: "",
        versions: [
          {
            isVariable: false,
            amount: 10,
            activationDate: "2026-01-01T00:00:00Z",
          },
        ],
      };

      expect(() => getActiveFee("TEST_FEE")).toThrow(
        new FeeConfigurationError("TEST_FEE", "tcsAppId is required"),
      );
    });

    it("throws FeeConfigurationError when an activation date is invalid", () => {
      staticFees.TEST_FEE = {
        name: "Test Fee",
        tcsAppId: "TEST_APP",
        versions: [
          {
            isVariable: false,
            amount: 10,
            activationDate: "not-a-date",
          },
        ],
      };

      expect(() => getActiveFee("TEST_FEE")).toThrow(
        new FeeConfigurationError(
          "TEST_FEE",
          "Invalid activationDate 'not-a-date'",
        ),
      );
    });

    it("throws FeeConfigurationError when a fixed fee has no amount", () => {
      staticFees.TEST_FEE = {
        name: "Test Fee",
        tcsAppId: "TEST_APP",
        versions: [
          {
            isVariable: false,
            activationDate: "2026-01-01T00:00:00Z",
          },
        ],
      };

      expect(() => getActiveFee("TEST_FEE")).toThrow(
        new FeeConfigurationError(
          "TEST_FEE",
          "A fixed fee version must define an amount",
        ),
      );
    });
  });
});
