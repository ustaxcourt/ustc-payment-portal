import { processPayment } from "./processPayment";
import { testAppContext as appContext } from "../test/testAppContext";
import { ClientPermission } from "../types/ClientPermission";
import { ForbiddenError } from "../errors/forbidden";
import { GoneError } from "../errors/gone";
import { NotFoundError } from "../errors/notFound";
import { ServerError } from "../errors/serverError";
import TransactionModel from "../db/TransactionModel";
import FeesModel from "../db/FeesModel";

jest.mock("../db/TransactionModel", () => ({
  __esModule: true,
  default: {
    findByPaygovToken: jest.fn(),
    findPendingOrProcessedByReferenceId: jest.fn(),
    updateAfterPayGovResponse: jest.fn(),
    updateToFailed: jest.fn(),
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

const mockTransaction = {
  feeId: "fee-123",
  agencyTrackingId: "agency-tracking-id-001",
  transactionReferenceId: "ref-123",
  transactionStatus: "initiated",
  clientName: "Test Client",
  createdAt: "2026-01-15T10:30:00Z",
  lastUpdatedAt: "2026-01-15T10:35:00Z",
  paymentMethod: null,
} as unknown as TransactionModel;

const mockUpdatedTransaction = (paymentMethod: string | null) => ({
  ...mockTransaction,
  paymentMethod,
  lastUpdatedAt: "2026-01-15T10:35:01Z",
} as unknown as TransactionModel);

const mockPayGovTrackingId = "211d8c91c046404fb159b52d042a12ba";

// DB rows returned by findByReferenceId after each outcome
const mockProcessedRow = {
  ...mockTransaction,
  transactionStatus: "processed",
  paygovTrackingId: mockPayGovTrackingId,
  paymentMethod: "plastic_card",
  returnDetail: null,
  lastUpdatedAt: "2026-01-15T10:35:01Z",
} as unknown as TransactionModel;

const mockFailedRow = {
  ...mockTransaction,
  transactionStatus: "failed",
  paygovTrackingId: null,
  paymentMethod: null,
  returnDetail: "The card has been declined, the transaction will not be processed.",
  returnCode: 3001,
  lastUpdatedAt: "2026-01-15T10:35:01Z",
} as unknown as TransactionModel;

const mockPendingRow = {
  ...mockTransaction,
  transactionStatus: "pending",
  paygovTrackingId: mockPayGovTrackingId,
  paymentMethod: "ach",
  returnDetail: null,
  lastUpdatedAt: "2026-01-15T10:35:01Z",
} as unknown as TransactionModel;

const mockGenericFaultRow = {
  ...mockTransaction,
  transactionStatus: "failed",
  paygovTrackingId: null,
  paymentMethod: null,
  returnDetail: "Pay.gov returned a fault without error details",
  lastUpdatedAt: "2026-01-15T10:35:01Z",
} as unknown as TransactionModel;
const mockPendingResponse = `<?xml version="1.0" encoding="UTF-8"?>
<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/">
  <S:Header>
    <WorkContext xmlns="http://oracle.com/weblogic/soap/workarea/">blah=</WorkContext>
  </S:Header>
  <S:Body>
    <ns2:completeOnlineCollectionWithDetailsResponse xmlns:ns2="http://fms.treas.gov/services/tcsonline_3_1">
      <completeOnlineCollectionWithDetailsResponse>
        <paygov_tracking_id>${mockPayGovTrackingId}</paygov_tracking_id>
        <agency_tracking_id>agency-tracking-token</agency_tracking_id>
        <transaction_amount>150.00</transaction_amount>
        <transaction_type>Sale</transaction_type>
        <transaction_date>2023-09-18T10:54:05</transaction_date>
        <payment_date>2023-09-19</payment_date>
        <transaction_status>Received</transaction_status>
        <payment_type>ACH</payment_type>
      </completeOnlineCollectionWithDetailsResponse>
    </ns2:completeOnlineCollectionWithDetailsResponse>
  </S:Body>
</S:Envelope>
`;

const mockSuccessfulResponse = `<?xml version="1.0" encoding="UTF-8"?>
<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/">
  <S:Header>
    <WorkContext xmlns="http://oracle.com/weblogic/soap/workarea/">blah=</WorkContext>
  </S:Header>
  <S:Body>
    <ns2:completeOnlineCollectionWithDetailsResponse xmlns:ns2="http://fms.treas.gov/services/tcsonline_3_1">
      <completeOnlineCollectionWithDetailsResponse>
        <paygov_tracking_id>${mockPayGovTrackingId}</paygov_tracking_id>
        <agency_tracking_id>agency-tracking-token</agency_tracking_id>
        <transaction_amount>150.00</transaction_amount>
        <transaction_type>Sale</transaction_type>
        <transaction_date>2023-09-18T10:54:05</transaction_date>
        <payment_date>2023-09-19</payment_date>
        <transaction_status>Success</transaction_status>
        <payment_type>PLASTIC_CARD</payment_type>
      </completeOnlineCollectionWithDetailsResponse>
    </ns2:completeOnlineCollectionWithDetailsResponse>
  </S:Body>
</S:Envelope>
`;

const mockUnsuccessfulResponse = `<?xml version="1.0" encoding="UTF-8"?>
  <S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/">
  <S:Header>
    <WorkContext xmlns="http://oracle.com/weblogic/soap/workarea/">blah=</WorkContext>
  </S:Header>
  <S:Body>
    <S:Fault xmlns:ns4="http://www.w3.org/2003/05/soap-envelope">
      <faultcode>S:Server</faultcode>
      <faultstring>TCS Error</faultstring>
      <detail>
        <ns2:TCSServiceFault xmlns:ns2="http://fms.treas.gov/services/tcsonline_3_1">
          <return_code>3001</return_code>
          <return_detail>The card has been declined, the transaction will not be processed.</return_detail>
        </ns2:TCSServiceFault>
      </detail>
    </S:Fault>
  </S:Body>
</S:Envelope>`;

const mockFaultWithoutDetail = `<?xml version="1.0" encoding="UTF-8"?>
  <S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/">
  <S:Header>
    <WorkContext xmlns="http://oracle.com/weblogic/soap/workarea/">blah=</WorkContext>
  </S:Header>
  <S:Body>
    <S:Fault xmlns:ns4="http://www.w3.org/2003/05/soap-envelope">
      <faultcode>S:Server</faultcode>
      <faultstring>TCS Error</faultstring>
    </S:Fault>
  </S:Body>
</S:Envelope>`;

const mockFaultWithoutTCSServiceFault = `<?xml version="1.0" encoding="UTF-8"?>
  <S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/">
  <S:Header>
    <WorkContext xmlns="http://oracle.com/weblogic/soap/workarea/">blah=</WorkContext>
  </S:Header>
  <S:Body>
    <S:Fault xmlns:ns4="http://www.w3.org/2003/05/soap-envelope">
      <faultcode>S:Server</faultcode>
      <faultstring>TCS Error</faultstring>
      <detail>
        <SomeOtherFault>Error</SomeOtherFault>
      </detail>
    </S:Fault>
  </S:Body>
</S:Envelope>`;

describe("processPayment", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    TransactionModelMock.findByPaygovToken.mockResolvedValue(mockTransaction);
    TransactionModelMock.findPendingOrProcessedByReferenceId.mockResolvedValue(undefined);
    TransactionModelMock.updateAfterPayGovResponse.mockImplementation(
      async (_id, _tid, _ts, _ps, paymentMethod) => mockUpdatedTransaction(paymentMethod),
    );
    TransactionModelMock.updateToFailed.mockResolvedValue(mockUpdatedTransaction(null));
    TransactionModelMock.findByReferenceId.mockResolvedValue([]);
    FeesModelMock.getFeeById.mockResolvedValue({ feeId: "fee-123", tcsAppId: "TCSUSTAXCOURTPETITION" } as unknown as FeesModel);
  });

  it("throws NotFoundError when token is not in the database", async () => {
    TransactionModelMock.findByPaygovToken.mockResolvedValueOnce(undefined);

    await expect(
      processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("throws ForbiddenError when client does not have access to the transaction's fee", async () => {
    await expect(
      processPayment(appContext, {
        client: { ...mockClient, allowedFeeIds: ["some-other-fee"] },
        request: { token: "mock-token" },
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("proceeds when client has wildcard fee access", async () => {
    await expect(
      processPayment(appContext, {
        client: { ...mockClient, allowedFeeIds: ["*"] },
        request: { token: "mock-token" },
      }),
    ).rejects.not.toThrow(ForbiddenError);
  });

  it("throws GoneError when a sibling transaction is already pending", async () => {
    TransactionModelMock.findPendingOrProcessedByReferenceId.mockResolvedValueOnce(
      { transactionStatus: "pending" } as unknown as TransactionModel,
    );

    await expect(
      processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      }),
    ).rejects.toThrow(GoneError);
  });

  it("throws GoneError when a sibling transaction is already processed", async () => {
    TransactionModelMock.findPendingOrProcessedByReferenceId.mockResolvedValueOnce(
      { transactionStatus: "processed" } as unknown as TransactionModel,
    );

    await expect(
      processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      }),
    ).rejects.toThrow(GoneError);
  });

  it("throws GoneError when transaction status is not initiated", async () => {
    TransactionModelMock.findByPaygovToken.mockResolvedValueOnce(
      { feeId: "fee-123", transactionReferenceId: "ref-123", transactionStatus: "failed" } as unknown as TransactionModel,
    );

    await expect(
      processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      }),
    ).rejects.toThrow(GoneError);
  });

  it("throws NotFoundError when fee is not found for the transaction", async () => {
    FeesModelMock.getFeeById.mockResolvedValueOnce(undefined);

    await expect(
      processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("throws ServerError when fee has no tcsAppId", async () => {
    FeesModelMock.getFeeById.mockResolvedValueOnce({ feeId: "fee-123", tcsAppId: "" } as unknown as FeesModel);

    await expect(
      processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      }),
    ).rejects.toThrow(ServerError);
  });

  it("passes the fee's tcsAppId to the SOAP request", async () => {
    appContext.postHttpRequest = jest.fn().mockReturnValue(mockSuccessfulResponse);

    await processPayment(appContext, {
      client: mockClient,
      request: { token: "mock-token" },
    });

    expect(appContext.postHttpRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("<tcs_app_id>TCSUSTAXCOURTPETITION</tcs_app_id>"),
    );
  });

  describe("Successfully processed Transaction", () => {
    beforeAll(() => {
      appContext.postHttpRequest = jest
        .fn()
        .mockReturnValue(mockSuccessfulResponse);
    });

    beforeEach(() => {
      TransactionModelMock.findByReferenceId.mockResolvedValue([mockProcessedRow]);
    });

    it("returns paymentStatus success", async () => {
      const result = await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      });

      expect(result.paymentStatus).toBe("success");
    });

    it("returns a single transaction with transactionStatus processed and payGovTrackingId", async () => {
      const result = await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      });

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].transactionStatus).toBe("processed");
      expect(result.transactions[0].payGovTrackingId).toBe(mockPayGovTrackingId);
    });

    it("maps paymentMethod from DB format to API format", async () => {
      const result = await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      });

      expect(result.transactions[0].paymentMethod).toBe("Credit/Debit Card");
    });

    it("returns the freshly-persisted paymentMethod (not the stale pre-update value)", async () => {
      // Regression guard: initiated transactions always have paymentMethod=null.
      // If the response reads from the pre-update `transaction`, the client sees
      // undefined even though Pay.gov returned (and we stored) a real value.
      expect(mockTransaction.paymentMethod).toBeNull();

      const result = await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      });

      expect(result.transactions[0].paymentMethod).toBe("Credit/Debit Card");
    });

    it("includes timestamps from the transaction record", async () => {
      const result = await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      });

      expect(result.transactions[0].createdTimestamp).toBe("2026-01-15T10:30:00Z");
      expect(result.transactions[0].updatedTimestamp).toBe("2026-01-15T10:35:01Z");
    });

    it("persists the result to the database via updateAfterPayGovResponse", async () => {
      await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      });

      expect(TransactionModelMock.updateAfterPayGovResponse).toHaveBeenCalledWith(
        "agency-tracking-id-001",
        mockPayGovTrackingId,
        "processed",
        "success",
        "plastic_card",
        "2023-09-18T10:54:05",
        "2023-09-19",
      );
    });

    it("proceeds when client has exact fee access", async () => {
      const result = await processPayment(appContext, {
        client: { ...mockClient, allowedFeeIds: ["fee-123"] },
        request: { token: "mock-token" },
      });

      expect(result.paymentStatus).toBe("success");
      expect(result.transactions[0].transactionStatus).toBe("processed");
    });

    it("includes all transactions for the transactionReferenceId, not just the current one", async () => {
      const earlierFailedRow = {
        ...mockTransaction,
        agencyTrackingId: "earlier-attempt-id",
        transactionStatus: "failed",
        paygovTrackingId: null,
        paymentMethod: null,
        returnDetail: "Card declined",
        createdAt: "2026-01-14T09:00:00Z",
        lastUpdatedAt: "2026-01-14T09:01:00Z",
      } as unknown as TransactionModel;
      TransactionModelMock.findByReferenceId.mockResolvedValueOnce([earlierFailedRow, mockProcessedRow]);

      const result = await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      });

      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[0].transactionStatus).toBe("failed");
      expect(result.transactions[1].transactionStatus).toBe("processed");
    });

    it("preserves ascending createdAt order returned by the database", async () => {
      const rows = [
        { ...mockProcessedRow, agencyTrackingId: "id-1", transactionStatus: "failed", createdAt: "2026-01-13T08:00:00Z" },
        { ...mockProcessedRow, agencyTrackingId: "id-2", transactionStatus: "failed", createdAt: "2026-01-14T09:00:00Z" },
        { ...mockProcessedRow, agencyTrackingId: "id-3", createdAt: "2026-01-15T10:30:00Z" },
      ] as unknown as TransactionModel[];
      TransactionModelMock.findByReferenceId.mockResolvedValueOnce(rows);

      const result = await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      });

      expect(result.transactions).toHaveLength(3);
      expect(result.transactions[0].createdTimestamp).toBe("2026-01-13T08:00:00Z");
      expect(result.transactions[1].createdTimestamp).toBe("2026-01-14T09:00:00Z");
      expect(result.transactions[2].createdTimestamp).toBe("2026-01-15T10:30:00Z");
    });
  });

  describe("Unsuccessful processing Transaction", () => {
    beforeAll(() => {
      appContext.postHttpRequest = jest
        .fn()
        .mockReturnValue(mockUnsuccessfulResponse);
    });

    beforeEach(() => {
      TransactionModelMock.findByReferenceId.mockResolvedValue([mockFailedRow]);
    });

    it("returns paymentStatus failed", async () => {
      const result = await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      });

      expect(result.paymentStatus).toBe("failed");
    });

    it("returns a single transaction with transactionStatus failed and no payGovTrackingId", async () => {
      const result = await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      });

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].transactionStatus).toBe("failed");
      expect(result.transactions[0].payGovTrackingId).toBeUndefined();
    });

    it("returns returnDetail that indicates why the transaction failed", async () => {
      const result = await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      });

      expect(result.transactions[0].returnDetail).toBe(
        "The card has been declined, the transaction will not be processed.",
      );
    });

    it("persists the failure to the database via updateToFailed", async () => {
      await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      });

      expect(TransactionModelMock.updateToFailed).toHaveBeenCalledWith(
        "agency-tracking-id-001",
        3001,
        "The card has been declined, the transaction will not be processed.",
      );
    });
  });

  describe("Pending processing Transaction", () => {
    beforeAll(() => {
      appContext.postHttpRequest = jest
        .fn()
        .mockReturnValue(mockPendingResponse);
    });

    beforeEach(() => {
      TransactionModelMock.findByReferenceId.mockResolvedValue([mockPendingRow]);
    });

    it("returns paymentStatus pending", async () => {
      const result = await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      });

      expect(result.paymentStatus).toBe("pending");
    });

    it("returns a single transaction with transactionStatus pending", async () => {
      const result = await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      });

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].transactionStatus).toBe("pending");
    });

    it("persists the result to the database via updateAfterPayGovResponse", async () => {
      await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      });

      expect(TransactionModelMock.updateAfterPayGovResponse).toHaveBeenCalledWith(
        "agency-tracking-id-001",
        mockPayGovTrackingId,
        "pending",
        "pending",
        "ach",
        "2023-09-18T10:54:05",
        "2023-09-19",
      );
    });
  });

  describe("Fault handling edge cases (Pay.gov throws us an error)", () => {
    beforeEach(() => {
      TransactionModelMock.findByReferenceId.mockResolvedValue([mockGenericFaultRow]);
    });

    it("handles fault without detail object", async () => {
      appContext.postHttpRequest = jest
        .fn()
        .mockReturnValue(mockFaultWithoutDetail);

      const result = await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      });

      expect(result.paymentStatus).toBe("failed");
      expect(result.transactions[0].transactionStatus).toBe("failed");
      expect(result.transactions[0].returnDetail).toBe("Pay.gov returned a fault without error details");
    });

    it("handles fault with detail but no TCSServiceFault", async () => {
      appContext.postHttpRequest = jest
        .fn()
        .mockReturnValue(mockFaultWithoutTCSServiceFault);

      const result = await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      });

      expect(result.paymentStatus).toBe("failed");
      expect(result.transactions[0].transactionStatus).toBe("failed");
      expect(result.transactions[0].returnDetail).toBe("Pay.gov returned a fault without error details");
    });

    it("persists failure to database on fault", async () => {
      appContext.postHttpRequest = jest
        .fn()
        .mockReturnValue(mockFaultWithoutDetail);

      await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      });

      expect(TransactionModelMock.updateToFailed).toHaveBeenCalledWith(
        "agency-tracking-id-001",
        undefined,
        "Pay.gov returned a fault without error details",
      );
    });
  });
});
