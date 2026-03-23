import TransactionModel from "../db/TransactionModel";
import { testAppContext as appContext } from "../test/testAppContext";
import { getTransactionPaymentStatus } from "./getTransactionPaymentStatus";

describe("getTransactionPaymentStatus", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns aggregated payment status totals", async () => {
    jest.spyOn(TransactionModel, "getAggregatedPaymentStatus").mockResolvedValue({
      success: 10,
      failed: 3,
      pending: 7,
      total: 20,
    });

    const result = await getTransactionPaymentStatus(appContext);

    expect(result).toEqual({
      success: 10,
      failed: 3,
      pending: 7,
      total: 20,
    });
  });
});
