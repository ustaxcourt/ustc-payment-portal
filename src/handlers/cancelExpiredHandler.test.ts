jest.mock("@useCases/cancelExpiredTransactions", () => ({
  cancelExpiredTransactions: jest.fn(),
}));

jest.mock("../appContext", () => ({
  createAppContext: jest.fn(),
}));

import { cancelExpiredTransactions } from "@useCases/cancelExpiredTransactions";
import { createAppContext } from "../appContext";
import { testAppContext } from "../test/testAppContext";
import { cancelExpiredHandler } from "./cancelExpiredHandler";

const cancelExpiredMock =
  cancelExpiredTransactions as jest.MockedFunction<
    typeof cancelExpiredTransactions
  >;
const createAppContextMock = createAppContext as jest.MockedFunction<
  typeof createAppContext
>;

describe("cancelExpiredHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createAppContextMock.mockReturnValue(testAppContext);
  });

  it("returns the sweep result", async () => {
    cancelExpiredMock.mockResolvedValueOnce({
      cancelledCount: 4,
      batches: 1,
      truncated: false,
    });

    await expect(cancelExpiredHandler()).resolves.toEqual({
      cancelledCount: 4,
      batches: 1,
      truncated: false,
    });
    expect(cancelExpiredMock).toHaveBeenCalledTimes(1);
  });

  // Lambda must record a failed invocation so the error alarm fires.
  it("lets the use case's error propagate", async () => {
    cancelExpiredMock.mockRejectedValueOnce(new Error("connection reset"));

    await expect(cancelExpiredHandler()).rejects.toThrow("connection reset");
  });
});
