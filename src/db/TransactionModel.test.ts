import TransactionModel from "./TransactionModel";

describe("TransactionModel", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("$parseDatabaseJson", () => {
    it("converts feeAmount to number", () => {
      const model = new TransactionModel();

      const parsed = model.$parseDatabaseJson({
        feeAmount: "150.25",
      });

      expect(parsed.feeAmount).toBe(150.25);
    });
  });

  describe("getByPaymentStatus", () => {
    it("queries by paymentStatus and limits to 100 newest rows", async () => {
      const limit = jest.fn().mockResolvedValue([]);
      const orderBy = jest.fn().mockReturnValue({ limit });
      const where = jest.fn().mockReturnValue({ orderBy });
      jest.spyOn(TransactionModel, "query").mockReturnValue({ where } as any);

      await TransactionModel.getByPaymentStatus("success");

      expect(where).toHaveBeenCalledWith("paymentStatus", "success");
      expect(orderBy).toHaveBeenCalledWith("createdAt", "desc");
      expect(limit).toHaveBeenCalledWith(100);
    });
  });

  describe("getAll", () => {
    it("queries newest rows without limits", async () => {
      const limit = jest.fn().mockResolvedValue([]);
      const orderBy = jest.fn().mockReturnValue({ limit });
      jest.spyOn(TransactionModel, "query").mockReturnValue({ orderBy } as any);

      await TransactionModel.getAll();

      expect(orderBy).toHaveBeenCalledWith("createdAt", "desc");
      expect(limit).toHaveBeenCalledWith(100);
    });
  });

  describe("getAggregatedPaymentStatus", () => {
    it("aggregates known statuses and computes total", async () => {
      const rows = [
        { paymentStatus: "success", count: "4" },
        { paymentStatus: "failed", count: 2 },
        { paymentStatus: "pending", count: "3" },
        { paymentStatus: "initiated", count: "99" },
      ];

      const groupBy = jest.fn().mockResolvedValue(rows);
      const count = jest.fn().mockReturnValue({ groupBy });
      const select = jest.fn().mockReturnValue({ count });
      jest.spyOn(TransactionModel, "query").mockReturnValue({ select } as any);

      const totals = await TransactionModel.getAggregatedPaymentStatus();

      expect(select).toHaveBeenCalledWith("paymentStatus");
      expect(count).toHaveBeenCalledWith("* as count");
      expect(groupBy).toHaveBeenCalledWith("paymentStatus");
      expect(totals).toEqual({
        success: 4,
        failed: 2,
        pending: 3,
        total: 9,
      });
    });
  });
});
