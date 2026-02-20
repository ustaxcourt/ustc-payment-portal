import { PayGovTransactionStatus } from "../types/TransactionStatus";
import { parseTransactionStatus } from "./parseTransactionStatus";

describe("parseTransactionStatus", () => {
  it.each(["Success", "Settled"] as PayGovTransactionStatus[])(
    "Returns Success for all successful transaction statuses",
    (transactionStatus: PayGovTransactionStatus) => {
      expect(parseTransactionStatus(transactionStatus)).toBe("Success");
    },
  );

  it.each(["Failed", "Cancelled", "Retired"] as PayGovTransactionStatus[])(
    "Returns Success for all successful transaction statuses",
    (transactionStatus: PayGovTransactionStatus) => {
      expect(parseTransactionStatus(transactionStatus)).toBe("Failed");
    },
  );

  it.each(["Pending", "Received", "Waiting"] as PayGovTransactionStatus[])(
    "Returns Success for all successful transaction statuses",
    (transactionStatus: PayGovTransactionStatus) => {
      expect(parseTransactionStatus(transactionStatus)).toBe("Pending");
    },
  );

  it("throws an error for invalid transaction status", () => {
    expect(() => {
      parseTransactionStatus("InvalidStatus" as PayGovTransactionStatus);
    }).toThrow("Could not parse transaction status InvalidStatus");
  });
});
