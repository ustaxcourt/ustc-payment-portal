import {
  derivePaymentStatus,
  derivePaymentStatusFromSingleTransaction,
} from "./derivePaymentStatus";
import TransactionModel from "../db/TransactionModel";
import { TransactionStatus } from "../schemas/TransactionStatus.schema";

const makeRow = (transactionStatus: TransactionStatus): TransactionModel =>
  ({ transactionStatus } as unknown as TransactionModel);

describe("derivePaymentStatus", () => {
  it('returns "success" when at least one status is processed', () => {
    expect(derivePaymentStatus([makeRow("processed")])).toBe("success");
  });

  it('returns "success" when processed appears among failures', () => {
    expect(derivePaymentStatus([makeRow("failed"), makeRow("processed")])).toBe(
      "success",
    );
  });

  it('returns "failed" when all statuses are failed', () => {
    expect(derivePaymentStatus([makeRow("failed")])).toBe("failed");
    expect(derivePaymentStatus([makeRow("failed"), makeRow("failed")])).toBe(
      "failed",
    );
  });

  it('returns "pending" when statuses are a mix without processed', () => {
    expect(derivePaymentStatus([makeRow("pending"), makeRow("failed")])).toBe(
      "pending",
    );
    expect(derivePaymentStatus([makeRow("received"), makeRow("failed")])).toBe(
      "pending",
    );
    expect(derivePaymentStatus([makeRow("initiated")])).toBe("pending");
  });

  it('returns "pending" for an empty array', () => {
    expect(derivePaymentStatus([])).toBe("pending");
  });
});

describe("derivePaymentStatusFromSingleTransaction", () => {
  it('returns "success" for "processed"', () => {
    expect(derivePaymentStatusFromSingleTransaction("processed")).toBe(
      "success",
    );
  });

  it('returns "failed" for "failed"', () => {
    expect(derivePaymentStatusFromSingleTransaction("failed")).toBe("failed");
  });

  it('returns "pending" for "received"', () => {
    expect(derivePaymentStatusFromSingleTransaction("received")).toBe(
      "pending",
    );
  });

  it('returns "pending" for "initiated"', () => {
    expect(derivePaymentStatusFromSingleTransaction("initiated")).toBe(
      "pending",
    );
  });

  it('returns "pending" for "pending"', () => {
    expect(derivePaymentStatusFromSingleTransaction("pending")).toBe("pending");
  });
});
