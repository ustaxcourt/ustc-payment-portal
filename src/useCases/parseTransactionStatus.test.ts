import { PayGovTransactionStatus } from "../types/TransactionStatus";
import { parseTransactionStatus } from "./parseTransactionStatus";

describe("parseTransactionStatus", () => {
  it.each(["Success", "Settled"] as PayGovTransactionStatus[])(
    "Returns Processed for all successful transaction statuses",
    (transactionStatus: PayGovTransactionStatus) => {
      expect(parseTransactionStatus(transactionStatus)).toBe("processed");
    }
  );

  it.each(["Failed", "Cancelled", "Retired"] as PayGovTransactionStatus[])(
    "Returns Success for all successful transaction statuses",
    (transactionStatus: PayGovTransactionStatus) => {
      expect(parseTransactionStatus(transactionStatus)).toBe("failed");
    }
  );

  it.each(["Pending", "Received", "Waiting"] as PayGovTransactionStatus[])(
    "Returns Success for all successful transaction statuses",
    (transactionStatus: PayGovTransactionStatus) => {
      expect(parseTransactionStatus(transactionStatus)).toBe("pending");
    }
  );

  it("throws an error for invalid transaction status", () => {
    expect(() => {
      parseTransactionStatus("InvalidStatus" as PayGovTransactionStatus);
    }).toThrow("Could not parse transaction status InvalidStatus");
  });
});
