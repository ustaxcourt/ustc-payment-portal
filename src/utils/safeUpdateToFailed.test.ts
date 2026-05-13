import { safeUpdateToFailed } from "./safeUpdateToFailed";
import TransactionModel from "../db/TransactionModel";

jest.mock("../db/TransactionModel", () => ({
  __esModule: true,
  default: { updateToFailed: jest.fn() },
}));

const TransactionModelMock = TransactionModel as jest.Mocked<
  typeof TransactionModel
>;

describe("safeUpdateToFailed", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls updateToFailed with the provided args", async () => {
    await safeUpdateToFailed("agency-123", 5009, "some detail");

    expect(TransactionModelMock.updateToFailed).toHaveBeenCalledWith(
      "agency-123",
      5009,
      "some detail",
    );
  });

  it("does not throw when updateToFailed rejects", async () => {
    TransactionModelMock.updateToFailed.mockRejectedValueOnce(
      new Error("db down"),
    );

    await expect(safeUpdateToFailed("agency-123")).resolves.toBeUndefined();
  });

  it("logs the agencyTrackingId and error when updateToFailed rejects", async () => {
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
    const dbError = new Error("db down");
    TransactionModelMock.updateToFailed.mockRejectedValueOnce(dbError);

    await safeUpdateToFailed("agency-123");

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("agency-123"),
      dbError,
    );
    consoleErrorSpy.mockRestore();
  });
});
