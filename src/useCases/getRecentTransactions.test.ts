import TransactionModel from "../db/TransactionModel";
import { testAppContext as appContext } from "../test/testAppContext";
import { getRecentTransactions } from "./getRecentTransactions";

const createdAt = new Date("2026-03-17T12:00:00.000Z");
const lastUpdatedAt = new Date("2026-03-17T13:00:00.000Z");

const transactionRow = {
  agencyTrackingId: "agency-1",
  paygovTrackingId: "paygov-1",
  feeName: "Filing Fee",
  feeId: "PETITION_FILING_FEE",
  transactionAmount: 100,
  clientName: "payment-portal",
  transactionReferenceId: "ref-1",
  paymentStatus: "success",
  transactionStatus: "processed",
  paygovToken: "token-1",
  paymentMethod: "plastic_card",
  metadata: { source: "test" },
  createdAt,
  lastUpdatedAt,
};

describe("getRecentTransactions", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("normalizes Date timestamps to ISO strings", async () => {
    jest.spyOn(TransactionModel, "getAll").mockResolvedValue([transactionRow as any]);

    const result = await getRecentTransactions(appContext);

    expect(result.total).toBe(1);
    expect(result.data[0].createdAt).toBe(createdAt.toISOString());
    expect(result.data[0].lastUpdatedAt).toBe(lastUpdatedAt.toISOString());
  });
});
