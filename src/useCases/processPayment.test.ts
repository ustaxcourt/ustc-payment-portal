import { processPayment } from "./processPayment";
import { testAppContext as appContext } from "../test/testAppContext";
import { ClientPermission } from "../types/ClientPermission";
import { ForbiddenError } from "../errors/forbidden";
import { GoneError } from "../errors/gone";
import { NotFoundError } from "../errors/notFound";
import TransactionModel from "../db/TransactionModel";

jest.mock("../db/TransactionModel", () => ({
  __esModule: true,
  default: {
    findByPaygovToken: jest.fn(),
    findPendingOrProcessedByReferenceId: jest.fn(),
    updateAfterPayGovResponse: jest.fn().mockResolvedValue({
      createdAt: "2026-01-15T10:30:00Z",
      lastUpdatedAt: "2026-01-15T10:35:01Z",
    }),
    updateToFailed: jest.fn().mockResolvedValue({
      createdAt: "2026-01-15T10:30:00Z",
      lastUpdatedAt: "2026-01-15T10:35:01Z",
    }),
  },
}));

const TransactionModelMock = TransactionModel as jest.Mocked<typeof TransactionModel>;

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
  paymentMethod: "plastic_card",
} as unknown as TransactionModel;

const mockPayGovTrackingId = "211d8c91c046404fb159b52d042a12ba";
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

  it("throws an error if we pass in an invalid request", async () => {
    await expect(
      processPayment(appContext, {
        client: mockClient,
        request: {
          foo: 20,
        } as any,
      }),
    ).rejects.toThrow();
  });

  describe("Successfully processed Transaction", () => {
    beforeAll(() => {
      appContext.postHttpRequest = jest
        .fn()
        .mockReturnValue(mockSuccessfulResponse);
    });

    it("returns paymentStatus success", async () => {
      const result = await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      });

      expect(result.paymentStatus).toBe("success");
    });

    it("returns a single transaction with transactionStatus processed", async () => {
      const result = await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      });

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].transactionStatus).toBe("processed");
    });

    it("maps paymentMethod from DB format to API format", async () => {
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
  });

  describe("Unsuccessful processing Transaction", () => {
    beforeAll(() => {
      appContext.postHttpRequest = jest
        .fn()
        .mockReturnValue(mockUnsuccessfulResponse);
    });

    it("returns paymentStatus failed", async () => {
      const result = await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      });

      expect(result.paymentStatus).toBe("failed");
    });

    it("returns a single transaction with transactionStatus failed", async () => {
      const result = await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      });

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].transactionStatus).toBe("failed");
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
      );
    });
  });

  describe("Pending processing Transaction", () => {
    beforeAll(() => {
      appContext.postHttpRequest = jest
        .fn()
        .mockReturnValue(mockPendingResponse);
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
      );
    });
  });

  describe("Fault handling edge cases", () => {
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
      expect(result.transactions[0].returnDetail).toBe("Transaction Error");
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
      expect(result.transactions[0].returnDetail).toBe("Transaction Error");
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
      );
    });
  });
});
