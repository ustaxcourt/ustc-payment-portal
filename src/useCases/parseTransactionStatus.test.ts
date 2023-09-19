import { PayGovTransactionStatus } from "../types/TransactionStatus";
import { parseTransactionStatus } from "./parseTransactionStatus";

describe("parseTransactionStatus", () => {
  it.each(["Success", "Settled"] as PayGovTransactionStatus[])(
    "Returns Success for all successful transaction statuses",
    (transactionStatus: PayGovTransactionStatus) => {
      expect(parseTransactionStatus(transactionStatus)).toBe("Success");
    }
  );

  it.each(["Failed", "Cancelled", "Retired"] as PayGovTransactionStatus[])(
    "Returns Success for all successful transaction statuses",
    (transactionStatus: PayGovTransactionStatus) => {
      expect(parseTransactionStatus(transactionStatus)).toBe("Failed");
    }
  );

  it.each(["Pending", "Received", "Waiting"] as PayGovTransactionStatus[])(
    "Returns Success for all successful transaction statuses",
    (transactionStatus: PayGovTransactionStatus) => {
      expect(parseTransactionStatus(transactionStatus)).toBe("Pending");
    }
  );
});
