import { processPayment } from "./processPayment";
import { testAppContext as appContext } from "../test/testAppContext";
import type { ClientPermission } from "@appTypes/ClientPermission";
import { ConflictError } from "@errors/conflict";
import { ForbiddenError } from "@errors/forbidden";
import { GoneError } from "@errors/gone";
import { NotFoundError } from "@errors/notFound";
import { PayGovError } from "@errors/payGovError";
import { ServerError } from "@errors/serverError";
import TransactionModel from "../db/TransactionModel";
import FeesModel from "../db/FeesModel";
import { emitProcessPaymentConflictMetric } from "../health/processPaymentConcurrencyMetric";
import { emitPayGovErrorMetric } from "../health/payGovHealthMetric";

const emitProcessPaymentConflictMetricMock =
  emitProcessPaymentConflictMetric as jest.MockedFunction<
    typeof emitProcessPaymentConflictMetric
  >;

jest.mock("../health/processPaymentConcurrencyMetric", () => ({
  emitProcessPaymentConflictMetric: jest.fn(),
}));

jest.mock("../db/TransactionModel", () => ({
  __esModule: true,
  default: {
    findByPaygovToken: jest.fn(),
    claimForProcessing: jest.fn(),
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

jest.mock("../health/payGovHealthMetric", () => ({
  emitPayGovErrorMetric: jest.fn(),
}));

const TransactionModelMock = TransactionModel as jest.Mocked<
  typeof TransactionModel
>;
const FeesModelMock = FeesModel as jest.Mocked<typeof FeesModel>;
const emitErrorMock = emitPayGovErrorMetric as jest.MockedFunction<
  typeof emitPayGovErrorMetric
>;

const mockClient: ClientPermission = {
  clientName: "Test Client",
  clientRoleArn: "arn:aws:iam::123456789012:role/test-client",
  allowedFeeKeys: ["*"],
};

const mockTransaction = {
  feeId: "fee-123",
  agencyTrackingId: "agency-tracking-id-001",
  transactionReferenceId: "ref-123",
  transactionStatus: "processing",
  clientName: "Test Client",
  metadata: {
    docketNumber: "2026-ABC-001",
  },
  createdAt: "2026-01-15T10:30:00Z",
  lastUpdatedAt: "2026-01-15T10:35:00Z",
  paymentMethod: null,
} as unknown as TransactionModel;

const mockUpdatedTransaction = (paymentMethod: string | null) =>
  ({
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
  returnDetail:
    "The card has been declined, the transaction will not be processed.",
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

const mockMalformedResponse = `<?xml version="1.0" encoding="UTF-8"?>
<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/">
  <S:Header>
    <WorkContext xmlns="http://oracle.com/weblogic/soap/workarea/">blah=</WorkContext>
  </S:Header>
  <S:Body>
    <ns2:completeOnlineCollectionWithDetailsResponse xmlns:ns2="http://fms.treas.gov/services/tcsonline_3_1">
      <completeOnlineCollectionWithDetailsResponse>
        <agency_tracking_id>agency-tracking-token</agency_tracking_id>
      </completeOnlineCollectionWithDetailsResponse>
    </ns2:completeOnlineCollectionWithDetailsResponse>
  </S:Body>
</S:Envelope>
`;

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

const mockInitiatedTransaction = {
  ...mockTransaction,
  transactionStatus: "initiated",
} as unknown as TransactionModel;

describe("processPayment", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    TransactionModelMock.findByPaygovToken.mockResolvedValue(
      mockInitiatedTransaction,
    );
    TransactionModelMock.claimForProcessing.mockResolvedValue(mockTransaction);
    TransactionModelMock.updateAfterPayGovResponse.mockImplementation(
      async (_id, _tid, _ts, _ps, paymentMethod) =>
        mockUpdatedTransaction(paymentMethod),
    );
    TransactionModelMock.updateToFailed.mockResolvedValue(
      mockUpdatedTransaction(null),
    );
    TransactionModelMock.findByReferenceId.mockResolvedValue([]);
    FeesModelMock.getFeeById.mockResolvedValue({
      feeId: "fee-123",
      feeKey: "fee-123",
      tcsAppId: "TCSUSTAXCOURTPETITION",
    } as unknown as FeesModel);
  });

  it("throws NotFoundError when token is not in the database", async () => {
    TransactionModelMock.findByPaygovToken.mockResolvedValueOnce(undefined);

    await expect(
      processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      }),
    ).rejects.toThrow(NotFoundError);

    expect(TransactionModelMock.claimForProcessing).not.toHaveBeenCalled();
  });

  it("throws ForbiddenError when client does not have access to the transaction's fee", async () => {
    await expect(
      processPayment(appContext, {
        client: { ...mockClient, allowedFeeKeys: ["some-other-fee"] },
        request: { token: "mock-token" },
      }),
    ).rejects.toThrow(ForbiddenError);

    expect(TransactionModelMock.claimForProcessing).not.toHaveBeenCalled();
  });

  it("proceeds when client has wildcard fee access", async () => {
    await expect(
      processPayment(appContext, {
        client: { ...mockClient, allowedFeeKeys: ["*"] },
        request: { token: "mock-token" },
      }),
    ).rejects.not.toThrow(ForbiddenError);
  });

  it("throws GoneError when a sibling transaction is already pending", async () => {
    TransactionModelMock.claimForProcessing.mockRejectedValueOnce(
      new GoneError(
        "This token is no longer valid. Another transaction is already fulfilling this obligation. Use the getDetails API to check the current status.",
      ),
    );

    await expect(
      processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      }),
    ).rejects.toThrow(GoneError);
  });

  it("throws GoneError when a sibling transaction is already processed", async () => {
    TransactionModelMock.claimForProcessing.mockRejectedValueOnce(
      new GoneError(
        "This token is no longer valid. Another transaction is already fulfilling this obligation. Use the getDetails API to check the current status.",
      ),
    );

    await expect(
      processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      }),
    ).rejects.toThrow(GoneError);
  });

  it("throws GoneError when transaction status is not initiated", async () => {
    TransactionModelMock.claimForProcessing.mockRejectedValueOnce(
      new GoneError("This token is no longer valid."),
    );

    await expect(
      processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      }),
    ).rejects.toThrow(GoneError);
  });

  it("throws ConflictError when claim is rejected due to concurrent processing", async () => {
    TransactionModelMock.claimForProcessing.mockRejectedValueOnce(
      new ConflictError(ConflictError.PAYMENT_IN_FLIGHT_MESSAGE),
    );

    await expect(
      processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("throws ConflictError when Postgres lock is not available", async () => {
    const lockErr = new Error("could not obtain lock") as Error & {
      code: string;
    };
    lockErr.code = "55P03";
    TransactionModelMock.claimForProcessing.mockRejectedValueOnce(lockErr);

    await expect(
      processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      }),
    ).rejects.toThrow(
      new ConflictError(ConflictError.PAYMENT_IN_FLIGHT_MESSAGE),
    );

    expect(emitProcessPaymentConflictMetricMock).toHaveBeenCalledWith(
      "lock_not_available",
    );
    expect(appContext.logger.info).toHaveBeenCalledWith(
      "processPayment claim rejected — concurrent request",
      expect.objectContaining({
        agencyTrackingId: mockInitiatedTransaction.agencyTrackingId,
        postgresErrorCode: "55P03",
      }),
    );
  });

  it("throws ConflictError when Postgres detects a deadlock during claim", async () => {
    const deadlockErr = new Error("deadlock detected") as Error & {
      code: string;
    };
    deadlockErr.code = "40P01";
    TransactionModelMock.claimForProcessing.mockRejectedValueOnce(deadlockErr);

    await expect(
      processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      }),
    ).rejects.toThrow(
      new ConflictError(ConflictError.PAYMENT_IN_FLIGHT_MESSAGE),
    );

    expect(emitProcessPaymentConflictMetricMock).toHaveBeenCalledWith(
      "deadlock",
    );
  });

  it("emits a metric when claim is rejected due to concurrent processing", async () => {
    TransactionModelMock.claimForProcessing.mockRejectedValueOnce(
      new ConflictError(ConflictError.PAYMENT_IN_FLIGHT_MESSAGE),
    );

    await expect(
      processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      }),
    ).rejects.toThrow(ConflictError);

    expect(emitProcessPaymentConflictMetricMock).toHaveBeenCalledWith(
      "claim_in_progress",
    );
  });

  describe("pre-claim authorization", () => {
    it("loads the token and authorizes the client before claiming processing", async () => {
      appContext.postHttpRequest = jest
        .fn()
        .mockReturnValue(mockSuccessfulResponse);
      TransactionModelMock.findByReferenceId.mockResolvedValue([
        mockProcessedRow,
      ]);

      await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      });

      expect(TransactionModelMock.findByPaygovToken).toHaveBeenCalledWith(
        "mock-token",
      );
      expect(TransactionModelMock.claimForProcessing).toHaveBeenCalledWith(
        "mock-token",
      );
      expect(
        TransactionModelMock.findByPaygovToken.mock.invocationCallOrder[0],
      ).toBeLessThan(
        TransactionModelMock.claimForProcessing.mock.invocationCallOrder[0],
      );
    });

    it("does not claim when authorization fails", async () => {
      await expect(
        processPayment(appContext, {
          client: { ...mockClient, allowedFeeKeys: ["some-other-fee"] },
          request: { token: "mock-token" },
        }),
      ).rejects.toThrow(ForbiddenError);

      expect(TransactionModelMock.findByPaygovToken).toHaveBeenCalled();
      expect(TransactionModelMock.claimForProcessing).not.toHaveBeenCalled();
    });
  });

  it("throws NotFoundError when fee is not found for the transaction", async () => {
    FeesModelMock.getFeeById.mockResolvedValueOnce(undefined);

    await expect(
      processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      }),
    ).rejects.toThrow(NotFoundError);

    expect(TransactionModelMock.updateToFailed).toHaveBeenCalledWith(
      mockTransaction.agencyTrackingId,
      undefined,
      "Fee configuration not found for this transaction",
    );
  });

  it("does not claim the token when fee lookup throws", async () => {
    const dbErr = new Error("connection refused");
    FeesModelMock.getFeeById.mockRejectedValueOnce(dbErr);

    await expect(
      processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      }),
    ).rejects.toThrow(dbErr);

    expect(TransactionModelMock.claimForProcessing).not.toHaveBeenCalled();
    expect(TransactionModelMock.updateToFailed).not.toHaveBeenCalled();
  });

  it("throws ServerError when fee has no tcsAppId", async () => {
    FeesModelMock.getFeeById.mockResolvedValueOnce({
      feeId: "fee-123",
      feeKey: "fee-123",
      tcsAppId: "",
    } as unknown as FeesModel);

    await expect(
      processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      }),
    ).rejects.toThrow(ServerError);

    expect(TransactionModelMock.updateToFailed).toHaveBeenCalledWith(
      mockTransaction.agencyTrackingId,
      undefined,
      "Fee is missing tcsAppId configuration",
    );
  });

  it("passes the fee's tcsAppId to the SOAP request", async () => {
    appContext.postHttpRequest = jest
      .fn()
      .mockReturnValue(mockSuccessfulResponse);

    await processPayment(appContext, {
      client: mockClient,
      request: { token: "mock-token" },
    });

    expect(appContext.postHttpRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("<tcs_app_id>TCSUSTAXCOURTPETITION</tcs_app_id>"),
    );
  });

  describe("logging", () => {
    it("logs debug on request receipt and info with request parameters and IDs after loading transaction", async () => {
      appContext.postHttpRequest = jest
        .fn()
        .mockReturnValue(mockSuccessfulResponse);
      TransactionModelMock.findByReferenceId.mockResolvedValue([
        mockProcessedRow,
      ]);

      await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      });

      expect(appContext.logger.debug).toHaveBeenCalledWith(
        "Received processPayment request",
        expect.objectContaining({
          token: "mock-token",
        }),
      );

      expect(appContext.logger.info).toHaveBeenCalledWith(
        "Loaded processPayment request context",
        expect.objectContaining({
          token: "mock-token",
          agencyTrackingId: "agency-tracking-id-001",
          transactionReferenceId: "ref-123",
          clientName: "Test Client",
          feeKey: "fee-123",
          metadata: {
            docketNumber: "2026-ABC-001",
          },
          requestParameters: {
            token: "mock-token",
          },
        }),
      );
    });

    it("logs info with the Pay.gov response payload", async () => {
      appContext.postHttpRequest = jest
        .fn()
        .mockReturnValue(mockSuccessfulResponse);
      TransactionModelMock.findByReferenceId.mockResolvedValue([
        mockProcessedRow,
      ]);

      await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      });

      expect(appContext.logger.info).toHaveBeenCalledWith(
        "Received Pay.gov response",
        expect.objectContaining({
          token: "mock-token",
          agencyTrackingId: "agency-tracking-id-001",
          transactionReferenceId: "ref-123",
          clientName: "Test Client",
          feeKey: "fee-123",
          payGovResponse: expect.objectContaining({
            paygov_tracking_id: mockPayGovTrackingId,
            transaction_status: "Success",
            payment_type: "PLASTIC_CARD",
          }),
        }),
      );
    });

    it("logs error when interaction with Pay.gov fails", async () => {
      appContext.postHttpRequest = jest
        .fn()
        .mockRejectedValue(new Error("ECONNRESET"));

      await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      }).catch((e) => e);

      expect(appContext.logger.error).toHaveBeenCalledWith(
        "Error communicating with Pay.gov",
        expect.objectContaining({
          token: "mock-token",
          agencyTrackingId: "agency-tracking-id-001",
          transactionReferenceId: "ref-123",
          clientName: "Test Client",
          feeKey: "fee-123",
        }),
      );
    });

    it("logs error when persisting the Pay.gov result fails", async () => {
      appContext.postHttpRequest = jest
        .fn()
        .mockReturnValue(mockSuccessfulResponse);
      TransactionModelMock.updateAfterPayGovResponse.mockRejectedValueOnce(
        new Error("db down"),
      );

      await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      }).catch((e) => e);

      expect(appContext.logger.error).toHaveBeenCalledWith(
        "Failed to persist Pay.gov response",
        expect.objectContaining({
          token: "mock-token",
          agencyTrackingId: "agency-tracking-id-001",
          transactionReferenceId: "ref-123",
          clientName: "Test Client",
          feeKey: "fee-123",
          paygovTrackingId: mockPayGovTrackingId,
        }),
      );
    });
  });

  describe("Successfully processed Transaction", () => {
    beforeAll(() => {
      appContext.postHttpRequest = jest
        .fn()
        .mockReturnValue(mockSuccessfulResponse);
    });

    beforeEach(() => {
      TransactionModelMock.findByReferenceId.mockResolvedValue([
        mockProcessedRow,
      ]);
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
      expect(result.transactions[0].payGovTrackingId).toBe(
        mockPayGovTrackingId,
      );
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

      expect(result.transactions[0].createdTimestamp).toBe(
        "2026-01-15T10:30:00Z",
      );
      expect(result.transactions[0].updatedTimestamp).toBe(
        "2026-01-15T10:35:01Z",
      );
    });

    it("persists the result to the database via updateAfterPayGovResponse", async () => {
      await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      });

      expect(
        TransactionModelMock.updateAfterPayGovResponse,
      ).toHaveBeenCalledWith(
        "agency-tracking-id-001",
        mockPayGovTrackingId,
        "processed",
        "success",
        "plastic_card",
        "2023-09-18T10:54:05",
        "2023-09-19",
        "processing",
      );
    });

    it("proceeds when client has exact fee access", async () => {
      const result = await processPayment(appContext, {
        client: { ...mockClient, allowedFeeKeys: ["fee-123"] },
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
      TransactionModelMock.findByReferenceId.mockResolvedValueOnce([
        earlierFailedRow,
        mockProcessedRow,
      ]);

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
        {
          ...mockProcessedRow,
          agencyTrackingId: "id-1",
          transactionStatus: "failed",
          createdAt: "2026-01-13T08:00:00Z",
        },
        {
          ...mockProcessedRow,
          agencyTrackingId: "id-2",
          transactionStatus: "failed",
          createdAt: "2026-01-14T09:00:00Z",
        },
        {
          ...mockProcessedRow,
          agencyTrackingId: "id-3",
          createdAt: "2026-01-15T10:30:00Z",
        },
      ] as unknown as TransactionModel[];
      TransactionModelMock.findByReferenceId.mockResolvedValueOnce(rows);

      const result = await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      });

      expect(result.transactions).toHaveLength(3);
      expect(result.transactions[0].createdTimestamp).toBe(
        "2026-01-13T08:00:00Z",
      );
      expect(result.transactions[1].createdTimestamp).toBe(
        "2026-01-14T09:00:00Z",
      );
      expect(result.transactions[2].createdTimestamp).toBe(
        "2026-01-15T10:30:00Z",
      );
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

    it("does not emit a PayGovError metric for a declined card (healthy Pay.gov)", async () => {
      await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      });

      expect(emitErrorMock).not.toHaveBeenCalled();
    });
  });

  describe("Pending processing Transaction", () => {
    beforeAll(() => {
      appContext.postHttpRequest = jest
        .fn()
        .mockReturnValue(mockPendingResponse);
    });

    beforeEach(() => {
      TransactionModelMock.findByReferenceId.mockResolvedValue([
        mockPendingRow,
      ]);
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

      expect(
        TransactionModelMock.updateAfterPayGovResponse,
      ).toHaveBeenCalledWith(
        "agency-tracking-id-001",
        mockPayGovTrackingId,
        "pending",
        "pending",
        "ach",
        "2023-09-18T10:54:05",
        "2023-09-19",
        "processing",
      );
    });
  });

  describe("Fault handling edge cases (Pay.gov throws us an error)", () => {
    beforeEach(() => {
      TransactionModelMock.findByReferenceId.mockResolvedValue([
        mockGenericFaultRow,
      ]);
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
      expect(result.transactions[0].returnDetail).toBe(
        "Pay.gov returned a fault without error details",
      );
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
      expect(result.transactions[0].returnDetail).toBe(
        "Pay.gov returned a fault without error details",
      );
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

  describe("Infrastructure errors", () => {
    it("throws PayGovError (500) and marks the transaction failed when Pay.gov response fails schema validation", async () => {
      appContext.postHttpRequest = jest
        .fn()
        .mockReturnValue(mockMalformedResponse);

      const zodErr = await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      }).catch((e) => e);

      expect(zodErr).toBeInstanceOf(PayGovError);
      expect(zodErr.statusCode).toBe(502);

      expect(TransactionModelMock.updateToFailed).toHaveBeenCalledWith(
        "agency-tracking-id-001",
        undefined,
        "Pay.gov returned a response that failed schema validation",
      );
      expect(
        TransactionModelMock.updateAfterPayGovResponse,
      ).not.toHaveBeenCalled();
      expect(emitErrorMock).not.toHaveBeenCalled();
    });

    it("throws PayGovError (504) and marks the transaction failed when makeSoapRequest fails with a network error", async () => {
      appContext.postHttpRequest = jest
        .fn()
        .mockRejectedValue(new Error("ECONNRESET"));

      const networkErr = await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      }).catch((e) => e);

      expect(networkErr).toBeInstanceOf(PayGovError);
      expect(networkErr.statusCode).toBe(504);

      expect(TransactionModelMock.updateToFailed).toHaveBeenCalledWith(
        "agency-tracking-id-001",
        undefined,
        "Error communicating with Pay.gov",
      );
      expect(
        TransactionModelMock.updateAfterPayGovResponse,
      ).not.toHaveBeenCalled();
      expect(emitErrorMock).toHaveBeenCalledTimes(1);
    });

    it("throws ServerError and marks the transaction failed when updateAfterPayGovResponse rejects", async () => {
      appContext.postHttpRequest = jest
        .fn()
        .mockReturnValue(mockSuccessfulResponse);
      TransactionModelMock.updateAfterPayGovResponse.mockRejectedValueOnce(
        new Error("db down"),
      );

      const dbErr = await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      }).catch((e) => e);

      expect(dbErr).toBeInstanceOf(ServerError);
      expect(dbErr.statusCode).toBe(500);

      expect(TransactionModelMock.updateToFailed).toHaveBeenCalledWith(
        "agency-tracking-id-001",
        undefined,
        "Failed to persist Pay.gov response",
      );
    });

    it("still throws ServerError when the recovery updateToFailed itself fails", async () => {
      appContext.postHttpRequest = jest
        .fn()
        .mockReturnValue(mockSuccessfulResponse);
      TransactionModelMock.updateAfterPayGovResponse.mockRejectedValueOnce(
        new Error("db down"),
      );
      TransactionModelMock.updateToFailed.mockRejectedValueOnce(
        new Error("db still down"),
      );

      const doubleFailErr = await processPayment(appContext, {
        client: mockClient,
        request: { token: "mock-token" },
      }).catch((e) => e);

      expect(doubleFailErr).toBeInstanceOf(ServerError);
      expect(doubleFailErr.statusCode).toBe(500);
    });
  });
});
