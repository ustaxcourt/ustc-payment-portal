jest.mock("../db/TransactionModel", () => ({
  __esModule: true,
  default: { cancelExpiredBatch: jest.fn() },
}));

jest.mock("../health/cancelSweepMetric", () => ({
  emitCancelSweepMetric: jest.fn(),
}));

import { CANCEL_SWEEP_BATCH_SIZE } from "@/config/constants";
import TransactionModel from "../db/TransactionModel";
import { emitCancelSweepMetric } from "../health/cancelSweepMetric";
import { testAppContext as appContext } from "../test/testAppContext";
import { cancelExpiredTransactions } from "./cancelExpiredTransactions";

const cancelExpiredBatchMock =
  TransactionModel.cancelExpiredBatch as jest.MockedFunction<
    typeof TransactionModel.cancelExpiredBatch
  >;
const emitMock = emitCancelSweepMetric as jest.MockedFunction<
  typeof emitCancelSweepMetric
>;

describe("cancelExpiredTransactions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("reports a zero count and still emits when nothing is expired", async () => {
    cancelExpiredBatchMock.mockResolvedValueOnce([]);

    const result = await cancelExpiredTransactions(appContext);

    expect(result).toEqual({ cancelledCount: 0 });
    expect(cancelExpiredBatchMock).toHaveBeenCalledWith(
      CANCEL_SWEEP_BATCH_SIZE,
    );
    expect(emitMock).toHaveBeenCalledWith(0);
  });

  it("reports and emits the number of rows cancelled", async () => {
    cancelExpiredBatchMock.mockResolvedValueOnce(["AGENCY-1", "AGENCY-2"]);

    const result = await cancelExpiredTransactions(appContext);

    expect(result).toEqual({ cancelledCount: 2 });
    expect(cancelExpiredBatchMock).toHaveBeenCalledTimes(1);
    expect(emitMock).toHaveBeenCalledWith(2);
  });

  it("lets a database failure surface so the invocation is recorded as failed", async () => {
    cancelExpiredBatchMock.mockRejectedValueOnce(new Error("connection reset"));

    await expect(cancelExpiredTransactions(appContext)).rejects.toThrow(
      "connection reset",
    );
    expect(emitMock).not.toHaveBeenCalled();
  });
});
