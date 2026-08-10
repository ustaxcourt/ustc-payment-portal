import { ConflictError } from "@errors/conflict";
import { safeUpdateToFailed } from "./safeUpdateToFailed";
import TransactionModel from "../db/TransactionModel";
import { testAppContext as appContext } from "../test/testAppContext";

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
    await safeUpdateToFailed(appContext, "agency-123", 5009, "some detail");

    expect(TransactionModelMock.updateToFailed).toHaveBeenCalledWith(
      "agency-123",
      5009,
      "some detail",
      undefined,
    );
  });

  it("forwards undefined for optional args when omitted", async () => {
    await safeUpdateToFailed(appContext, "agency-123");

    expect(TransactionModelMock.updateToFailed).toHaveBeenCalledWith(
      "agency-123",
      undefined,
      undefined,
      undefined,
    );
  });

  it("forwards the expected guard when provided", async () => {
    const transaction = {
      transactionStatus: "processing",
      lastUpdatedAt: "2026-08-10T00:00:00.000Z",
    } as unknown as TransactionModel;

    await safeUpdateToFailed(
      appContext,
      "agency-123",
      5009,
      "some detail",
      transaction,
    );

    expect(TransactionModelMock.updateToFailed).toHaveBeenCalledWith(
      "agency-123",
      5009,
      "some detail",
      transaction,
    );
  });

  it("does not throw when updateToFailed rejects with ConflictError from a lost guard", async () => {
    TransactionModelMock.updateToFailed.mockRejectedValueOnce(
      new ConflictError(ConflictError.PERSIST_RACE_MESSAGE),
    );
    const transaction = {
      transactionStatus: "processing",
      lastUpdatedAt: "2026-08-10T00:00:00.000Z",
    } as unknown as TransactionModel;

    await expect(
      safeUpdateToFailed(appContext, "agency-123", undefined, undefined, transaction),
    ).resolves.toBeUndefined();
  });

  it("does not throw when updateToFailed rejects", async () => {
    TransactionModelMock.updateToFailed.mockRejectedValueOnce(
      new Error("db down"),
    );

    await expect(
      safeUpdateToFailed(appContext, "agency-123"),
    ).resolves.toBeUndefined();
  });

  it("logs the agencyTrackingId and error when updateToFailed rejects", async () => {
    const dbError = new Error("db down");
    TransactionModelMock.updateToFailed.mockRejectedValueOnce(dbError);

    await safeUpdateToFailed(appContext, "agency-123");

    expect(appContext.logger.error).toHaveBeenCalledWith(
      "Failed to mark transaction 'agency-123' as failed during error recovery:",
      {
        errorName: dbError.name,
        errorMessage: dbError.message,
      },
    );
  });
});
