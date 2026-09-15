jest.mock("../db/TransactionModel", () => ({
  __esModule: true,
  default: { cancelExpiredBatch: jest.fn() },
}));

jest.mock("../health/cancelSweepMetric", () => ({
  emitCancelSweepMetric: jest.fn(),
}));

import {
  CANCEL_SWEEP_BATCH_SIZE,
  CANCEL_SWEEP_MAX_BATCHES,
} from "@/config/constants";
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

const ids = (count: number) =>
  Array.from({ length: count }, (_, index) => `AGENCY-${index}`);

describe("cancelExpiredTransactions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("stops after one batch when nothing is expired and reports a zero count", async () => {
    cancelExpiredBatchMock.mockResolvedValueOnce([]);

    const result = await cancelExpiredTransactions(appContext);

    expect(result).toEqual({ cancelledCount: 0, batches: 1, truncated: false });
    expect(cancelExpiredBatchMock).toHaveBeenCalledTimes(1);
    expect(cancelExpiredBatchMock).toHaveBeenCalledWith(CANCEL_SWEEP_BATCH_SIZE);
    expect(emitMock).toHaveBeenCalledWith(0);
  });

  it("stops on the first short batch", async () => {
    cancelExpiredBatchMock.mockResolvedValueOnce(ids(3));

    const result = await cancelExpiredTransactions(appContext);

    expect(result).toEqual({ cancelledCount: 3, batches: 1, truncated: false });
    expect(cancelExpiredBatchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps sweeping while batches come back full, then stops on the short one", async () => {
    cancelExpiredBatchMock
      .mockResolvedValueOnce(ids(CANCEL_SWEEP_BATCH_SIZE))
      .mockResolvedValueOnce(ids(CANCEL_SWEEP_BATCH_SIZE))
      .mockResolvedValueOnce(ids(7));

    const result = await cancelExpiredTransactions(appContext);

    expect(result).toEqual({
      cancelledCount: CANCEL_SWEEP_BATCH_SIZE * 2 + 7,
      batches: 3,
      truncated: false,
    });
    expect(emitMock).toHaveBeenCalledWith(CANCEL_SWEEP_BATCH_SIZE * 2 + 7);
  });

  // A backlog that never runs short must not loop forever; the next run picks up the rest.
  it("stops at the batch cap and reports the sweep as truncated", async () => {
    cancelExpiredBatchMock.mockResolvedValue(ids(CANCEL_SWEEP_BATCH_SIZE));

    const result = await cancelExpiredTransactions(appContext);

    expect(result).toEqual({
      cancelledCount: CANCEL_SWEEP_BATCH_SIZE * CANCEL_SWEEP_MAX_BATCHES,
      batches: CANCEL_SWEEP_MAX_BATCHES,
      truncated: true,
    });
    expect(cancelExpiredBatchMock).toHaveBeenCalledTimes(
      CANCEL_SWEEP_MAX_BATCHES,
    );
    expect(emitMock).toHaveBeenCalledTimes(1);
  });

  it("lets a database failure surface so the invocation is recorded as failed", async () => {
    cancelExpiredBatchMock.mockRejectedValueOnce(new Error("connection reset"));

    await expect(cancelExpiredTransactions(appContext)).rejects.toThrow(
      "connection reset",
    );
    expect(emitMock).not.toHaveBeenCalled();
  });
});
