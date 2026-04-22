import { getDetails } from "./getDetails";
import { testAppContext as appContext } from "../test/testAppContext";
import { ClientPermission } from "../types/ClientPermission";
import { NotFoundError } from "../errors/notFound";
import { ForbiddenError } from "../errors/forbidden";
import TransactionModel from "../db/TransactionModel";
import FeesModel from "../db/FeesModel";

jest.mock("../db/TransactionModel", () => ({
  __esModule: true,
  default: {
    findByReferenceId: jest.fn(),
  },
}));

jest.mock("../db/FeesModel", () => ({
  __esModule: true,
  default: {
    getFeeById: jest.fn(),
  },
}));

const TransactionModelMock = TransactionModel as jest.Mocked<typeof TransactionModel>;
const FeesModelMock = FeesModel as jest.Mocked<typeof FeesModel>;

const mockClient: ClientPermission = {
  clientName: "Test Client",
  clientRoleArn: "arn:aws:iam::123456789012:role/test-client",
  allowedFeeIds: ["*"],
};

const mockTransactionReferenceId = "550e8400-e29b-41d4-a716-446655440000";
const mockPayGovTrackingId = "test-tracking-id-12345";

const buildRow = (overrides: Partial<TransactionModel> = {}): TransactionModel =>
  ({
    agencyTrackingId: "agency-tracking-1",
    clientName: mockClient.clientName,
    feeId: "PETITION_FILING_FEE",
    transactionReferenceId: mockTransactionReferenceId,
    transactionStatus: "processed",
    paymentStatus: "success",
    paygovTrackingId: mockPayGovTrackingId,
    paymentMethod: "plastic_card",
    transactionAmount: 60,
    createdAt: "2026-01-15T10:30:00.000Z",
    lastUpdatedAt: "2026-01-15T10:35:00.000Z",
    ...overrides,
  }) as unknown as TransactionModel;

const mockPendingSoapResponse = `<?xml version="1.0" encoding="UTF-8"?>
<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/">
  <S:Body>
    <ns2:getDetailsResponse xmlns:ns2="http://fms.treas.gov/services/tcsonline_3_1">
      <getDetailsResponse>
        <transactions>
          <transaction>
            <paygov_tracking_id>${mockPayGovTrackingId}</paygov_tracking_id>
            <transaction_status>Received</transaction_status>
          </transaction>
        </transactions>
      </getDetailsResponse>
    </ns2:getDetailsResponse>
  </S:Body>
</S:Envelope>
`;

describe("getDetails", () => {
  beforeEach(() => {
    TransactionModelMock.findByReferenceId.mockResolvedValue([buildRow()]);
    FeesModelMock.getFeeById.mockResolvedValue(
      { feeId: "PETITION_FILING_FEE", tcsAppId: "TCSUSTAXCOURTPETITION" } as unknown as FeesModel,
    );
  });

  it("throws NotFoundError when no transactions exist for the reference id", async () => {
    TransactionModelMock.findByReferenceId.mockResolvedValueOnce([]);

    await expect(
      getDetails(appContext, {
        client: mockClient,
        request: { transactionReferenceId: mockTransactionReferenceId },
      }),
    ).rejects.toThrow(new NotFoundError("Transaction Reference Id was not found"));
  });

  it("throws ForbiddenError when transactions exist but belong to a different client", async () => {
    TransactionModelMock.findByReferenceId.mockResolvedValueOnce([
      buildRow({ clientName: "Some Other Client" }),
    ]);

    await expect(
      getDetails(appContext, {
        client: mockClient,
        request: { transactionReferenceId: mockTransactionReferenceId },
      }),
    ).rejects.toThrow(
      new ForbiddenError("You are not authorized to get details for this transaction."),
    );
  });

  it("throws NotFoundError when fee is not found for the transaction", async () => {
    FeesModelMock.getFeeById.mockResolvedValueOnce(undefined);

    await expect(
      getDetails(appContext, {
        client: mockClient,
        request: { transactionReferenceId: mockTransactionReferenceId },
      }),
    ).rejects.toThrow(NotFoundError);
  });

  describe("terminal status (no Pay.gov refresh)", () => {
    it("returns paymentStatus 'success' when the only attempt is processed", async () => {
      const postHttpRequestSpy = jest.fn();
      appContext.postHttpRequest = postHttpRequestSpy;

      const result = await getDetails(appContext, {
        client: mockClient,
        request: { transactionReferenceId: mockTransactionReferenceId },
      });

      expect(result.paymentStatus).toBe("success");
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].transactionStatus).toBe("processed");
      expect(postHttpRequestSpy).not.toHaveBeenCalled();
    });

    it("returns paymentStatus 'failed' when all attempts are failed", async () => {
      TransactionModelMock.findByReferenceId.mockResolvedValueOnce([
        buildRow({ transactionStatus: "failed", paymentStatus: "failed" }),
      ]);

      const result = await getDetails(appContext, {
        client: mockClient,
        request: { transactionReferenceId: mockTransactionReferenceId },
      });

      expect(result.paymentStatus).toBe("failed");
    });
  });

  describe("non-terminal status without paygovTrackingId (no Pay.gov refresh)", () => {
    it("returns the local DB status without calling Pay.gov", async () => {
      const postHttpRequestSpy = jest.fn();
      appContext.postHttpRequest = postHttpRequestSpy;

      TransactionModelMock.findByReferenceId.mockResolvedValueOnce([
        buildRow({
          transactionStatus: "received",
          paymentStatus: "pending",
          paygovTrackingId: null,
        }),
      ]);

      const result = await getDetails(appContext, {
        client: mockClient,
        request: { transactionReferenceId: mockTransactionReferenceId },
      });

      expect(result.paymentStatus).toBe("pending");
      expect(result.transactions[0].transactionStatus).toBe("received");
      expect(result.transactions[0].payGovTrackingId).toBeUndefined();
      expect(postHttpRequestSpy).not.toHaveBeenCalled();
    });
  });

  describe("non-terminal status with paygovTrackingId (refreshes from Pay.gov)", () => {
    beforeEach(() => {
      appContext.postHttpRequest = jest.fn().mockResolvedValue(mockPendingSoapResponse);
      TransactionModelMock.findByReferenceId.mockResolvedValueOnce([
        buildRow({
          transactionStatus: "pending",
          paymentStatus: "pending",
          paygovTrackingId: mockPayGovTrackingId,
        }),
      ]);
    });

    it("calls Pay.gov for the latest status", async () => {
      await getDetails(appContext, {
        client: mockClient,
        request: { transactionReferenceId: mockTransactionReferenceId },
      });

      expect(appContext.postHttpRequest).toHaveBeenCalled();
    });

    it("returns the refreshed transaction status from Pay.gov", async () => {
      const result = await getDetails(appContext, {
        client: mockClient,
        request: { transactionReferenceId: mockTransactionReferenceId },
      });

      // parseTransactionStatus maps Pay.gov "Received" → internal "pending"
      expect(result.transactions[0].transactionStatus).toBe("pending");
    });
  });
});
