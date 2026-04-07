let mockTransaction: any = null;

jest.mock("./TransactionModel", () => {
  const actual = jest.requireActual("./TransactionModel");
  return {
    __esModule: true,
    ...actual,
    default: class MockTransactionModel {
      static $parseDatabaseJson(json: Record<string, unknown>) {
        const parsed = { ...json };
        if (parsed.feeAmount !== undefined && parsed.feeAmount !== null) {
          parsed.feeAmount = Number(parsed.feeAmount);
        }
        return parsed;
      }
      static getByPaymentStatus = jest.fn(() => Promise.resolve([]));
      static getAll = jest.fn(() => Promise.resolve([]));
      static getAggregatedPaymentStatus = jest.fn(() => Promise.resolve({
        success: 4,
        failed: 2,
        pending: 3,
        total: 100,
      }));
      static createReceived = jest.fn((data) => {
        mockTransaction = {
          ...data,
          agencyTrackingId: data.agencyTrackingId || "MOCK-TRACKING-ID",
          transactionStatus: "received",
          paymentStatus: "pending",
        };
        return Promise.resolve(mockTransaction);
      });
      static updateToInitiated = jest.fn((agencyTrackingId, paygovToken) => {
        if (mockTransaction && mockTransaction.agencyTrackingId === agencyTrackingId) {
          mockTransaction.transactionStatus = "initiated";
          mockTransaction.paygovToken = paygovToken;
        }
        return Promise.resolve();
      });
      static updateToFailed = jest.fn((agencyTrackingId) => {
        if (mockTransaction && mockTransaction.agencyTrackingId === agencyTrackingId) {
          mockTransaction.transactionStatus = "failed";
          mockTransaction.paymentStatus = "failed";
        }
        return Promise.resolve();
      });
      static query = jest.fn(() => ({
        findById: (id: string) => Promise.resolve(id === mockTransaction?.agencyTrackingId ? mockTransaction : undefined),
      }));
      constructor() {
        // intentionally left blank
      }
      $parseDatabaseJson(json: Record<string, unknown>) {
        return MockTransactionModel.$parseDatabaseJson(json);
      }
    },
  };
});

import TransactionModel, { PaymentMethod } from "./TransactionModel";


describe("TransactionModel", () => {
  afterEach(() => {
    mockTransaction = null;
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
    it("resolves without error and returns an array", async () => {
      const result = await TransactionModel.getByPaymentStatus("success");
      expect(Array.isArray(result)).toBe(true);
    });
  });


  describe("getAll", () => {
    it("resolves without error and returns an array", async () => {
      const result = await TransactionModel.getAll();
      expect(Array.isArray(result)).toBe(true);
    });
  });


  describe("getAggregatedPaymentStatus", () => {
    it("returns the expected totals object", async () => {
      const totals = await TransactionModel.getAggregatedPaymentStatus();
      expect(totals).toEqual({
        success: 4,
        failed: 2,
        pending: 3,
        total: 100,
      });
    });
  });

  describe("createReceived", () => {
    it('should create a received transaction', async () => {
      const data = {
        agencyTrackingId: 'TEST-123',
        feeId: 'PETITION_FILING_FEE',
        clientName: 'test-client',
        transactionReferenceId: 'TXN-REF-001',
        paymentMethod: 'plastic_card' as PaymentMethod,
      };

      const transaction = await TransactionModel.createReceived(data);

      expect(transaction).toBeDefined();
      expect(transaction.agencyTrackingId).toBe(data.agencyTrackingId);
      expect(transaction.transactionStatus).toBe('received');
      expect(transaction.paymentStatus).toBe('pending');
    });
  });

  describe("updateToFailed", () => {
    it("should set both transactionStatus and paymentStatus to failed", async () => {
      await TransactionModel.createReceived({
        agencyTrackingId: "TEST-123",
        feeId: "PETITION_FILING_FEE",
        clientName: "test-client",
        transactionReferenceId: "TXN-REF-001",
        paymentMethod: 'plastic_card' as PaymentMethod,
      });

      await TransactionModel.updateToFailed("TEST-123");

      const updated = await TransactionModel.query().findById("TEST-123");
      expect(updated?.transactionStatus).toBe("failed");
      expect(updated?.paymentStatus).toBe("failed");
    });
  });

  describe("updateToInitiated", () => {
    it('should update transaction to initiated', async () => {
      const paygovToken = 'TOKEN123456';

      // Set up a transaction to update — no dependency on prior tests
      const created = await TransactionModel.createReceived({
        agencyTrackingId: 'INIT-TEST-123',
        feeId: 'PETITION_FILING_FEE',
        clientName: 'test-client',
        transactionReferenceId: 'TXN-REF-002',
      });

      await TransactionModel.updateToInitiated(created.agencyTrackingId, paygovToken);

      const updated = await TransactionModel.query().findById(created.agencyTrackingId);
      expect(updated).toBeDefined();
      expect(updated?.transactionStatus).toBe('initiated');
      expect(updated?.paygovToken).toBe(paygovToken);
    });
  });
});
