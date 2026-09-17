import {
  getAllReturnCodes,
  getReturnCode,
  payGovReturnCodes,
} from "./payGovReturnCodes";

describe("payGovReturnCodes config", () => {
  describe("getAllReturnCodes", () => {
    it("returns every return code declared in payGovReturnCodes, sorted ascending", () => {
      const all = getAllReturnCodes();
      expect(all.length).toBe(Object.keys(payGovReturnCodes).length);
      for (const entry of all) {
        expect(entry.returnDetail).toBeTruthy();
        expect(payGovReturnCodes[entry.returnCode]).toBeDefined();
      }
      const codes = all.map((entry) => entry.returnCode);
      expect(codes).toEqual([...codes].sort((a, b) => a - b));
    });
  });

  describe("getReturnCode", () => {
    it("returns the matching return code merged with its returnCode key", () => {
      const result = getReturnCode(3001);
      expect(result).toEqual({
        returnCode: 3001,
        returnDetail:
          "The card has been declined; the transaction will not be processed.",
        transactionStatus: "Failed",
      });
    });

    it("returns undefined for a return code not in the reference table", () => {
      expect(getReturnCode(9999)).toBeUndefined();
    });
  });
});
