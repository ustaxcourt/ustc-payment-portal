import { processPayment } from "./processPayment";
import { testAppContext as appContext } from "../test/testAppContext";
import { ClientPermission } from "../types/ClientPermission";
import { ForbiddenError } from "../errors/forbidden";
import { GoneError } from "../errors/gone";
import { NotFoundError } from "../errors/notFound";
import TransactionModel from "../db/TransactionModel";
import FeesModel from "../db/FeesModel";

jest.mock("../db/TransactionModel", () => ({
  __esModule: true,
  default: {
    findByPaygovToken: jest.fn(),
    findPendingOrProcessedByReferenceId: jest.fn(),
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
    TransactionModelMock.findByPaygovToken.mockResolvedValue(
      { feeId: "fee-123", transactionReferenceId: "ref-123", transactionStatus: "initiated" } as unknown as TransactionModel,
    );
    TransactionModelMock.findPendingOrProcessedByReferenceId.mockResolvedValue(undefined);
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

  it("throws NotFoundError when fee has no tcsAppId", async () => {
    FeesModelMock.getFeeById.mockResolvedValueOnce({ feeId: "fee-123", tcsAppId: "" } as unknown as FeesModel);

    await expect(
      processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      }),
    ).rejects.toThrow(NotFoundError);
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

  it("throws an error if we pass in an invalid request", async () => {
    TransactionModelMock.findByPaygovToken.mockResolvedValueOnce(undefined);

    await expect(
      processPayment(appContext, {
        client: mockClient,
        request: {
          foo: 20,
        } as any,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  describe("Successfully processed Transaction", () => {
    beforeAll(() => {
      appContext.postHttpRequest = jest
        .fn()
        .mockReturnValue(mockSuccessfulResponse);
    });

    it("returns the trackingId from the XML", async () => {
      const { trackingId } = await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      });

      expect(trackingId).toEqual(mockPayGovTrackingId);
    });

    it("returns the transactionStatus from the XML", async () => {
      const { transactionStatus } = await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      });

      expect(transactionStatus).toEqual("processed");
    });

    it("proceeds when client has exact fee access", async () => {
      const { transactionStatus } = await processPayment(appContext, {
        client: { ...mockClient, allowedFeeIds: ["fee-123"] },
        request: { token: "mock-token" },
      });

      expect(transactionStatus).toBe("processed");
    });
  });

  describe("Unsuccessful processing Transaction", () => {
    beforeAll(() => {
      appContext.postHttpRequest = jest
        .fn()
        .mockReturnValue(mockUnsuccessfulResponse);
    });

    it("does not return a trackingId", async () => {
      const { trackingId } = await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      });

      expect(trackingId).toBeUndefined();
    });

    it("returns transactionStatus failed", async () => {
      const { transactionStatus } = await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      });
      expect(transactionStatus).toBe("failed");
    });

    it("returns a message that indicates why the transaction failed", async () => {
      const { message } = await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      });

      expect(message).toBe(
        "The card has been declined, the transaction will not be processed.",
      );
    });

    it("returns the error code from the payment processor that indicates why the transaction failed", async () => {
      const { code } = await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      });

      expect(code).toBe(3001);
    });
  });

  describe("Pending processing Transaction", () => {
    beforeAll(() => {
      appContext.postHttpRequest = jest
        .fn()
        .mockReturnValue(mockPendingResponse);
    });

    it("Returns a trackingId", async () => {
      const { trackingId } = await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      });

      expect(trackingId).toBe(mockPayGovTrackingId);
    });

    it("returns Pending transaction status", async () => {
      const { transactionStatus } = await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      });
      expect(transactionStatus).toBe("pending");
    });
  });

  describe("Fault handling edge cases", () => {
    it("handles fault without detail object", async () => {
      appContext.postHttpRequest = jest
        .fn()
        .mockReturnValue(mockFaultWithoutDetail);

      const { transactionStatus, message } = await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      });

      expect(transactionStatus).toBe("failed");
      expect(message).toBe("Transaction Error");
    });

    it("handles fault with detail but no TCSServiceFault", async () => {
      appContext.postHttpRequest = jest
        .fn()
        .mockReturnValue(mockFaultWithoutTCSServiceFault);

      const { transactionStatus, message } = await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      });

      expect(transactionStatus).toBe("failed");
      expect(message).toBe("Transaction Error");
    });
  });
});
