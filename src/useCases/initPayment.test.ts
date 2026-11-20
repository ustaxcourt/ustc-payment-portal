import type { PayGovTransactionStatus } from "@appTypes/TransactionStatus";
import * as GetDetailsModule from "@entities/GetDetailsRequest";

const mockGetDetailsRequest = (
  transactionStatus: PayGovTransactionStatus = "Success",
) => {
  jest
    .spyOn(GetDetailsModule.GetRequestRequest.prototype, "makeSoapRequest")
    .mockResolvedValueOnce({
      paygov_tracking_id: "paygov-123",
      transaction_status: transactionStatus,
      payment_type: "ACH",
      transaction_date: "2026-11-17T16:53:50.789Z",
      payment_date: "2026-11-17",
    });
};

jest.mock("../db/TransactionModel", () => {
  const actual = jest.requireActual("../db/TransactionModel");
  return {
    __esModule: true,
    ...actual,
    default: {
      findByReferenceIdAndTransactionStatus: jest.fn(() =>
        Promise.resolve(undefined),
      ),
      findPendingOrProcessedByReferenceId: jest.fn(() =>
        Promise.resolve(undefined),
      ),
      createReceived: jest.fn(/* ... */),
      updateToInitiated: jest.fn(() => Promise.resolve()),
      updateToFailed: jest.fn(() => Promise.resolve()),
      updateToFailedIfNotProcessed: jest.fn(() => Promise.resolve()),
      updateToCancelled: jest.fn(() => Promise.resolve()),
      updateAfterPayGovResponse: jest.fn(() =>
        Promise.resolve({
          transactionStatus: "processed",
          paymentStatus: "success",
        }),
      ),
    },
  };
});

jest.mock("../config/fees", () => ({
  __esModule: true,

  getFeeNamesByKey: jest.fn(() => ({
    PETITION_FILING_FEE: "Petition Filing Fee",
    NONATTORNEY_EXAM_REGISTRATION_FEE: "Non-Attorney Exam Registration Fee",
  })),

  getActiveFee: jest.fn((fee) => {
    if (fee === "PETITION_FILING_FEE") {
      return {
        fee: "PETITION_FILING_FEE",
        tcsAppId: "USTAXCOURTPETITION",
        amount: 60,
        isVariable: false,
      };
    }

    if (fee === "NONATTORNEY_EXAM_REGISTRATION_FEE") {
      return {
        fee: "NONATTORNEY_EXAM_REGISTRATION_FEE",
        tcsAppId: "TCSUSTAXCOURTANAEF",
        amount: 250,
        isVariable: false,
      };
    }

    const { FeeNotFoundError } = jest.requireActual("../errors/feeNotFound");
    throw new FeeNotFoundError(fee);
  }),
}));

jest.mock("../health/payGovHealthMetric", () => ({
  emitPayGovErrorMetric: jest.fn(),
}));

jest.mock("../health/initPaymentConcurrencyMetric", () => ({
  emitInitPaymentConflictMetric: jest.fn(),
}));

import * as SoapRequestModule from "@entities/StartOnlineCollectionRequest";
import type { InitPaymentRequest } from "@schemas/InitPayment.schema";
import { ZodError } from "zod";
import { ConflictError } from "../errors/conflict";
import { PayGovError } from "../errors/payGovError";
import { emitInitPaymentConflictMetric } from "../health/initPaymentConcurrencyMetric";
import { emitPayGovErrorMetric } from "../health/payGovHealthMetric";
import { testAppContext as appContext } from "../test/testAppContext";
import type { ClientPermission } from "../types/ClientPermission";
import { initPayment } from "./initPayment";

const emitErrorMock = emitPayGovErrorMetric as jest.MockedFunction<
  typeof emitPayGovErrorMetric
>;
const emitConflictMock = emitInitPaymentConflictMetric as jest.MockedFunction<
  typeof emitInitPaymentConflictMetric
>;

const mockClient: ClientPermission = {
  clientName: "Test Client App",
  clientRoleArn: "arn:aws:iam::123456789012:role/test-client",
  allowedFeeKeys: ["*"],
};

const validPetitionRequest: InitPaymentRequest = {
  transactionReferenceId: "550e8400-e29b-41d4-a716-446655440000",
  fee: "PETITION_FILING_FEE",
  urlSuccess: "https://example.com/success",
  urlCancel: "https://example.com/cancel",
  metadata: { docketNumber: "123-26" },
};

const mockSoapRequest = (token: string) => {
  jest
    .spyOn(
      SoapRequestModule.StartOnlineCollectionRequest.prototype,
      "makeSoapRequest",
    )
    .mockResolvedValueOnce({ token });
};

describe("initPayment", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("throws InvalidRequestError with a clear message when fee key is unrecognized", async () => {
    await expect(
      initPayment(appContext, {
        client: mockClient,
        request: {
          transactionReferenceId: "550e8400-e29b-41d4-a716-446655440000",
          fee: "UNKNOWN_FEE" as InitPaymentRequest["fee"],
          urlCancel: "https://example.com/cancel",
          urlSuccess: "https://example.com/success",
          metadata: { docketNumber: "123-26" },
        },
      }),
    ).rejects.toThrow("Unknown fee: UNKNOWN_FEE");
  });

  it("returns a token and paymentRedirect for a valid PETITION_FILING_FEE request", async () => {
    mockSoapRequest("test-token-123");
    const TransactionModel = require("../db/TransactionModel").default;

    const result = await initPayment(appContext, {
      client: mockClient,
      request: validPetitionRequest,
    });

    expect(result.token).toBe("test-token-123");
    expect(result.paymentRedirect).toContain("test-token-123");
    expect(result.paymentRedirect).toContain("USTAXCOURTPETITION");
    expect(TransactionModel.createReceived).toHaveBeenCalledWith(
      expect.objectContaining({
        fee: "PETITION_FILING_FEE",
        transactionAmount: 60,
      }),
    );
    expect(TransactionModel.updateToInitiated).toHaveBeenCalled();
  });

  it("returns a token and paymentRedirect for a valid NONATTORNEY_EXAM_REGISTRATION_FEE request", async () => {
    mockSoapRequest("test-token-456");
    const TransactionModel = require("../db/TransactionModel").default;

    const result = await initPayment(appContext, {
      client: mockClient,
      request: {
        transactionReferenceId: "550e8400-e29b-41d4-a716-446655440000",
        fee: "NONATTORNEY_EXAM_REGISTRATION_FEE",
        urlSuccess: "https://example.com/success",
        urlCancel: "https://example.com/cancel",
        metadata: {
          email: "applicant@example.com",
          fullName: "John Doe",
          accessCode: "ABC123",
        },
      },
    });
    expect(result.token).toBe("test-token-456");
    expect(result.paymentRedirect).toContain("TCSUSTAXCOURTANAEF");
    expect(TransactionModel.createReceived).toHaveBeenCalledWith(
      expect.objectContaining({
        fee: "NONATTORNEY_EXAM_REGISTRATION_FEE",
        transactionAmount: 250,
      }),
    );
  });

  it("rejects a client not authorized for the fee before any lookup, write, or Pay.gov call", async () => {
    const soapSpy = jest
      .spyOn(
        SoapRequestModule.StartOnlineCollectionRequest.prototype,
        "makeSoapRequest",
      )
      .mockResolvedValue({ token: "should-not-be-issued" });
    const TransactionModel = require("../db/TransactionModel").default;
    const nonattorneyOnlyClient: ClientPermission = {
      ...mockClient,
      allowedFeeKeys: ["NONATTORNEY_EXAM_REGISTRATION_FEE"],
    };

    await expect(
      initPayment(appContext, {
        client: nonattorneyOnlyClient,
        request: validPetitionRequest,
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "Client not authorized for fee",
    });

    expect(
      TransactionModel.findByReferenceIdAndTransactionStatus,
    ).not.toHaveBeenCalled();
    expect(TransactionModel.createReceived).not.toHaveBeenCalled();
    expect(soapSpy).not.toHaveBeenCalled();
  });

  it("throws InvalidRequestError when amount is missing for a variable fee", async () => {
    const feesConfig = require("../config/fees");
    feesConfig.getActiveFee.mockReturnValueOnce({
      fee: "PETITION_FILING_FEE",
      tcsAppId: "USTAXCOURTPETITION",
      amount: 60,
      isVariable: true,
    });

    await expect(
      initPayment(appContext, {
        client: mockClient,
        request: validPetitionRequest,
      }),
    ).rejects.toThrow("requires an amount");
  });

  it("throws InvalidRequestError when amount is supplied for a non-variable fee", async () => {
    await expect(
      initPayment(appContext, {
        client: mockClient,
        request: { ...validPetitionRequest, amount: 60 },
      }),
    ).rejects.toThrow("does not allow variable amounts");
  });

  it.each([
    ["processed", "success", ConflictError.ALREADY_PAID_MESSAGE],
    ["pending", "pending", ConflictError.PAYMENT_SETTLING_MESSAGE],
  ])(
    "throws ConflictError when the obligation already has a %s attempt",
    async (transactionStatus, paymentStatus, expectedMessage) => {
      const TransactionModel = require("../db/TransactionModel").default;
      TransactionModel.findByReferenceIdAndTransactionStatus.mockResolvedValueOnce(
        {
          agencyTrackingId: "paid-id",
          clientName: mockClient.clientName,
          transactionReferenceId: validPetitionRequest.transactionReferenceId,
          transactionStatus,
          paymentStatus,
          paygovToken: "paid-token-abc",
          lastUpdatedAt: new Date().toISOString(),
        },
      );

      await expect(
        initPayment(appContext, {
          client: mockClient,
          request: validPetitionRequest,
        }),
      ).rejects.toMatchObject({
        statusCode: 409,
        message: expectedMessage,
      });

      expect(TransactionModel.createReceived).not.toHaveBeenCalled();
      expect(TransactionModel.updateToFailed).not.toHaveBeenCalled();
      expect(emitConflictMock).toHaveBeenCalledWith("already_paid");
    },
  );

  it("scopes the reference-id lookup to the requesting client", async () => {
    mockSoapRequest(crypto.randomUUID().replace(/-/g, ""));
    const TransactionModel = require("../db/TransactionModel").default;

    await initPayment(appContext, {
      client: mockClient,
      request: validPetitionRequest,
    });

    expect(
      TransactionModel.findByReferenceIdAndTransactionStatus,
    ).toHaveBeenCalledWith(
      mockClient.clientName,
      validPetitionRequest.transactionReferenceId,
      ["initiated", "processing", "pending", "processed"],
    );
  });

  it("allows a retry when the only prior attempt failed", async () => {
    const freshPaygovToken = crypto.randomUUID().replace(/-/g, "");
    mockSoapRequest(freshPaygovToken);
    const TransactionModel = require("../db/TransactionModel").default;
    // A 'failed' row is excluded by the model query, so the guard sees nothing.
    TransactionModel.findByReferenceIdAndTransactionStatus.mockResolvedValueOnce(
      undefined,
    );

    const result = await initPayment(appContext, {
      client: mockClient,
      request: validPetitionRequest,
    });

    expect(result.token).toBe(freshPaygovToken);
    expect(TransactionModel.createReceived).toHaveBeenCalled();
  });

  it("returns the existing token when an in-flight transaction has a fresh token (age < 3 hours)", async () => {
    const TransactionModel = require("../db/TransactionModel").default;
    TransactionModel.findByReferenceIdAndTransactionStatus.mockResolvedValueOnce(
      {
        agencyTrackingId: "existing-id",
        clientName: mockClient.clientName,
        transactionReferenceId: validPetitionRequest.transactionReferenceId,
        transactionStatus: "initiated",
        fee: validPetitionRequest.fee,
        paygovToken: "existing-token-abc",
        createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
        lastUpdatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      },
    );

    const result = await initPayment(appContext, {
      client: mockClient,
      request: validPetitionRequest,
    });

    expect(result.token).toBe("existing-token-abc");
    expect(result.paymentRedirect).toContain("existing-token-abc");
    expect(TransactionModel.createReceived).not.toHaveBeenCalled();
    expect(TransactionModel.updateToFailed).not.toHaveBeenCalled();
  });

  it("throws ConflictError when an attempt is actively processing (POST /process in flight)", async () => {
    const TransactionModel = require("../db/TransactionModel").default;
    TransactionModel.findByReferenceIdAndTransactionStatus.mockResolvedValueOnce(
      {
        agencyTrackingId: "existing-id",
        clientName: mockClient.clientName,
        transactionReferenceId: validPetitionRequest.transactionReferenceId,
        transactionStatus: "processing",
        fee: validPetitionRequest.fee,
        paygovToken: "processing-token-abc",
        createdAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
      },
    );

    await expect(
      initPayment(appContext, {
        client: mockClient,
        request: validPetitionRequest,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: ConflictError.PAYMENT_IN_FLIGHT_TRANSACTION_MESSAGE,
    });

    expect(TransactionModel.createReceived).not.toHaveBeenCalled();
    expect(TransactionModel.updateToFailed).not.toHaveBeenCalled();
    expect(emitConflictMock).toHaveBeenCalledWith("processing_in_flight");
  });

  it("blocks a stale processing attempt without a tracking ID", async () => {
    const stalePaygovToken = crypto.randomUUID().replace(/-/g, "");

    const TransactionModel = require("../db/TransactionModel").default;
    TransactionModel.findByReferenceIdAndTransactionStatus.mockResolvedValueOnce(
      {
        agencyTrackingId: "existing-id",
        clientName: mockClient.clientName,
        transactionReferenceId: validPetitionRequest.transactionReferenceId,
        transactionStatus: "processing",
        fee: validPetitionRequest.fee,
        paygovToken: stalePaygovToken,
        createdAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
        lastUpdatedAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
      },
    );

    await expect(initPayment(appContext, {
      client: mockClient,
      request: validPetitionRequest,
    })).rejects.toMatchObject({
      statusCode: 409,
      message: ConflictError.PAYMENT_OUTCOME_UNKNOWN_MESSAGE,
    });

    expect(TransactionModel.updateToFailedIfNotProcessed).not.toHaveBeenCalled();
    expect(TransactionModel.updateToCancelled).not.toHaveBeenCalled();
    expect(TransactionModel.createReceived).not.toHaveBeenCalled();
    expect(TransactionModel.updateToFailed).not.toHaveBeenCalled();
  });

  it("cancels an expired in-flight transaction and creates a new one when token age >= 3 hours", async () => {
    const expiredPaygovToken = crypto.randomUUID().replace(/-/g, "");
    const freshPaygovToken = crypto.randomUUID().replace(/-/g, "");

    mockSoapRequest(freshPaygovToken);
    const TransactionModel = require("../db/TransactionModel").default;
    TransactionModel.findByReferenceIdAndTransactionStatus.mockResolvedValueOnce(
      {
        agencyTrackingId: "existing-id",
        clientName: mockClient.clientName,
        transactionReferenceId: validPetitionRequest.transactionReferenceId,
        transactionStatus: "initiated",
        fee: validPetitionRequest.fee,
        paygovToken: expiredPaygovToken,
        createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), // 4 hours ago
        lastUpdatedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      },
    );

    const result = await initPayment(appContext, {
      client: mockClient,
      request: validPetitionRequest,
    });

    expect(TransactionModel.updateToCancelled).toHaveBeenCalledWith(
      "existing-id",
    );
    expect(TransactionModel.updateToFailed).not.toHaveBeenCalled();
    expect(TransactionModel.createReceived).toHaveBeenCalled();
    expect(result.token).toBe(freshPaygovToken);
  });

  it("falls through to create a new transaction when the in-flight record has no Pay.gov token", async () => {
    const freshPaygovToken = crypto.randomUUID().replace(/-/g, "");
    mockSoapRequest(freshPaygovToken);
    const TransactionModel = require("../db/TransactionModel").default;
    TransactionModel.findByReferenceIdAndTransactionStatus.mockResolvedValueOnce(
      {
        agencyTrackingId: "existing-id",
        clientName: mockClient.clientName,
        transactionReferenceId: validPetitionRequest.transactionReferenceId,
        transactionStatus: "initiated",
        fee: validPetitionRequest.fee,
        paygovToken: null,
        createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
        lastUpdatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      },
    );

    const result = await initPayment(appContext, {
      client: mockClient,
      request: validPetitionRequest,
    });

    expect(TransactionModel.createReceived).toHaveBeenCalled();
    expect(result.token).toBe(freshPaygovToken);
  });

  it("throws ConflictError when createReceived fails with a pg unique_violation (partial unique index race)", async () => {
    const TransactionModel = require("../db/TransactionModel").default;
    // App-level check passes (no existing initiated row visible), but the concurrent
    // peer wins the createReceived race and our insert violates the partial unique index.
    TransactionModel.findByReferenceIdAndTransactionStatus.mockResolvedValueOnce(
      undefined,
    );
    const uniqueViolation = Object.assign(
      new Error(
        'duplicate key value violates unique constraint "idx_transactions_unique_active"',
      ),
      { code: "23505" },
    );
    TransactionModel.createReceived.mockRejectedValueOnce(uniqueViolation);

    await expect(
      initPayment(appContext, {
        client: mockClient,
        request: validPetitionRequest,
      }),
    ).rejects.toThrow(ConflictError);
    expect(emitConflictMock).toHaveBeenCalledWith("persist_race");
  });

  it("reports already-paid, not a race, when processPayment wins the createReceived race", async () => {
    const TransactionModel = require("../db/TransactionModel").default;
    // TOCTOU: the guard read a clean slate, then a concurrent /process landed on 'processed'
    // and the partial unique index rejected our insert.
    TransactionModel.findByReferenceIdAndTransactionStatus.mockResolvedValueOnce(
      undefined,
    );
    TransactionModel.findPendingOrProcessedByReferenceId.mockResolvedValueOnce({
      agencyTrackingId: "paid-id",
      clientName: mockClient.clientName,
      transactionReferenceId: validPetitionRequest.transactionReferenceId,
      transactionStatus: "processed",
      paymentStatus: "success",
      lastUpdatedAt: new Date().toISOString(),
    });
    TransactionModel.createReceived.mockRejectedValueOnce(
      Object.assign(
        new Error(
          'duplicate key value violates unique constraint "idx_transactions_unique_active"',
        ),
        { code: "23505" },
      ),
    );

    await expect(
      initPayment(appContext, {
        client: mockClient,
        request: validPetitionRequest,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: ConflictError.ALREADY_PAID_MESSAGE,
    });
    expect(emitConflictMock).toHaveBeenCalledWith("already_paid");
    expect(emitConflictMock).not.toHaveBeenCalledWith("persist_race");
  });

  it("wraps non-unique-violation createReceived errors as a generic failure", async () => {
    const TransactionModel = require("../db/TransactionModel").default;
    TransactionModel.findByReferenceIdAndTransactionStatus.mockResolvedValueOnce(
      undefined,
    );
    TransactionModel.createReceived.mockRejectedValueOnce(
      new Error("connection refused"),
    );

    await expect(
      initPayment(appContext, {
        client: mockClient,
        request: validPetitionRequest,
      }),
    ).rejects.toThrow(/Failed to record received transaction/);
  });

  it("updates transaction to failed if SOAP request fails", async () => {
    jest
      .spyOn(
        SoapRequestModule.StartOnlineCollectionRequest.prototype,
        "makeSoapRequest",
      )
      .mockRejectedValueOnce(new Error("SOAP error"));
    const TransactionModel = require("../db/TransactionModel").default;

    const err = await initPayment(appContext, {
      client: mockClient,
      request: validPetitionRequest,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(PayGovError);
    expect(err.message).toBe(
      "There was an error communicating with Pay.gov. Please retry your transaction.",
    );
    expect(TransactionModel.createReceived).toHaveBeenCalled();
    expect(TransactionModel.updateToFailed).toHaveBeenCalled();
    expect(appContext.logger.error).toHaveBeenCalled();
  });

  it("still throws PayGovError if updateToFailed itself rejects when SOAP request fails", async () => {
    jest
      .spyOn(
        SoapRequestModule.StartOnlineCollectionRequest.prototype,
        "makeSoapRequest",
      )
      .mockRejectedValueOnce(new Error("SOAP error"));
    const TransactionModel = require("../db/TransactionModel").default;
    TransactionModel.updateToFailed.mockRejectedValueOnce(new Error("DB down"));

    await expect(
      initPayment(appContext, {
        client: mockClient,
        request: validPetitionRequest,
      }),
    ).rejects.toThrow(PayGovError);
    expect(appContext.logger.error).toHaveBeenCalledTimes(2);
  });

  it("calls updateToFailed and throws ServerError when updateToInitiated fails", async () => {
    mockSoapRequest("new-token-abc");
    const TransactionModel = require("../db/TransactionModel").default;
    TransactionModel.updateToInitiated.mockRejectedValueOnce(
      new Error("DB write failed"),
    );
    TransactionModel.updateToFailed.mockRejectedValueOnce(
      new Error("DB also down"),
    );

    await expect(
      initPayment(appContext, {
        client: mockClient,
        request: validPetitionRequest,
      }),
    ).rejects.toThrow(
      "Failed to record payment session. Please retry your transaction.",
    );
    expect(TransactionModel.updateToFailed).toHaveBeenCalled();
    expect(appContext.logger.error).toHaveBeenCalled();
  });

  it("throws PayGovError when Pay.gov SOAP request fails with a network error", async () => {
    const networkError = Object.assign(new Error("connect ECONNREFUSED"), {
      code: "ECONNREFUSED",
    });
    jest
      .spyOn(
        SoapRequestModule.StartOnlineCollectionRequest.prototype,
        "makeSoapRequest",
      )
      .mockRejectedValueOnce(networkError);
    const err = await initPayment(appContext, {
      client: mockClient,
      request: validPetitionRequest,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(PayGovError);
    expect(err.message).toBe(
      "There was an error communicating with Pay.gov. Please retry your transaction.",
    );
    expect(appContext.logger.error).toHaveBeenCalled();
  });

  it("wraps a ZodError thrown from makeSoapRequest as PayGovError (use-case catch-block contract)", async () => {
    const zodError = new ZodError([
      { code: "custom", path: [], message: "Required" },
    ]);
    jest
      .spyOn(
        SoapRequestModule.StartOnlineCollectionRequest.prototype,
        "makeSoapRequest",
      )
      .mockRejectedValueOnce(zodError);
    const TransactionModel = require("../db/TransactionModel").default;
    const err = await initPayment(appContext, {
      client: mockClient,
      request: validPetitionRequest,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(PayGovError);
    expect(err.message).toBe(
      "There was an error communicating with Pay.gov. Please retry your transaction.",
    );
    expect(TransactionModel.updateToFailed).toHaveBeenCalled();
    expect(appContext.logger.error).toHaveBeenCalled();
    expect(emitErrorMock).not.toHaveBeenCalled();
  });

  it("wraps a real malformed Pay.gov XML response as PayGovError (drives safeParse end-to-end)", async () => {
    // Empty <token/> → safeParse rejects → ZodError caught by initPayment as PayGovError.
    const malformedXml = `<?xml version="1.0" encoding="UTF-8"?>
<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/">
  <S:Body>
    <ns2:startOnlineCollectionResponse xmlns:ns2="http://fms.treas.gov/services/tcsonline_3_1">
      <startOnlineCollectionResponse>
        <token></token>
      </startOnlineCollectionResponse>
    </ns2:startOnlineCollectionResponse>
  </S:Body>
</S:Envelope>`;
    (appContext.postHttpRequest as jest.Mock).mockResolvedValueOnce(
      malformedXml,
    );
    const TransactionModel = require("../db/TransactionModel").default;

    const err = await initPayment(appContext, {
      client: mockClient,
      request: validPetitionRequest,
    }).catch((e) => e);

    expect(err).toBeInstanceOf(PayGovError);
    expect(err.message).toBe(
      "There was an error communicating with Pay.gov. Please retry your transaction.",
    );
    expect(TransactionModel.updateToFailed).toHaveBeenCalled();
    expect(appContext.logger.error).toHaveBeenCalled();
  });

  it("wraps a Pay.gov S:Fault envelope as PayGovError (drives handleFault end-to-end)", async () => {
    // Drives the handleFault path end-to-end. 5009 = existing-token return code.
    const faultXml = `<?xml version="1.0" encoding="UTF-8"?>
<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/">
  <S:Body>
    <S:Fault>
      <faultcode>S:Server</faultcode>
      <faultstring>TCSServiceFault</faultstring>
      <detail>
        <ns2:TCSServiceFault xmlns:ns2="http://fms.treas.gov/services/tcsonline_3_1">
          <return_code>5009</return_code>
          <return_detail>Existing token for this agency tracking id</return_detail>
        </ns2:TCSServiceFault>
      </detail>
    </S:Fault>
  </S:Body>
</S:Envelope>`;
    (appContext.postHttpRequest as jest.Mock).mockResolvedValueOnce(faultXml);
    const TransactionModel = require("../db/TransactionModel").default;

    const err = await initPayment(appContext, {
      client: mockClient,
      request: validPetitionRequest,
    }).catch((e) => e);

    expect(err).toBeInstanceOf(PayGovError);
    expect(err.message).toBe(
      "There was an error communicating with Pay.gov. Please retry your transaction.",
    );
    expect(TransactionModel.updateToFailed).toHaveBeenCalled();
    expect(appContext.logger.error).toHaveBeenCalled();
    expect(emitErrorMock).not.toHaveBeenCalled();
  });

  it("emits a PayGovError metric when the Pay.gov SOAP request fails", async () => {
    jest
      .spyOn(
        SoapRequestModule.StartOnlineCollectionRequest.prototype,
        "makeSoapRequest",
      )
      .mockRejectedValueOnce(new Error("SOAP error"));

    await initPayment(appContext, {
      client: mockClient,
      request: validPetitionRequest,
    }).catch((e) => e);

    expect(emitErrorMock).toHaveBeenCalledTimes(1);
  });

  it("does not emit a PayGovError metric on a successful init", async () => {
    mockSoapRequest("test-token-123");

    await initPayment(appContext, {
      client: mockClient,
      request: validPetitionRequest,
    });

    expect(emitErrorMock).not.toHaveBeenCalled();
  });

  it("returns 409 and updates the transaction when Pay.gov confirms a stale processing transaction was already processed", async () => {
    const TransactionModel = require("../db/TransactionModel").default;

    TransactionModel.findByReferenceIdAndTransactionStatus.mockResolvedValueOnce(
      {
        agencyTrackingId: "existing-id",
        clientName: mockClient.clientName,
        transactionReferenceId: validPetitionRequest.transactionReferenceId,
        transactionStatus: "processing",
        fee: validPetitionRequest.fee,
        paymentStatus: "pending",
        paygovTrackingId: "paygov-123",
        paygovToken: "stale-token",
        createdAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
        lastUpdatedAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
      },
    );

    mockGetDetailsRequest("Success");

    await expect(
      initPayment(appContext, {
        client: mockClient,
        request: validPetitionRequest,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: ConflictError.ALREADY_PAID_MESSAGE,
    });

    expect(TransactionModel.updateAfterPayGovResponse).toHaveBeenCalledWith(
      "existing-id",
      "paygov-123",
      "processed",
      "success",
      "ach",
      "2026-11-17T16:53:50.789Z",
      "2026-11-17",
      "processing",
      expect.any(String),
    );

    expect(
      TransactionModel.updateToFailedIfNotProcessed,
    ).not.toHaveBeenCalled();

    expect(TransactionModel.createReceived).not.toHaveBeenCalled();
  });

  it("marks a stale processing transaction as failed when Pay.gov confirms it was not processed", async () => {
    const freshPaygovToken = crypto.randomUUID().replace(/-/g, "");
    mockSoapRequest(freshPaygovToken);

    const TransactionModel = require("../db/TransactionModel").default;

    TransactionModel.findByReferenceIdAndTransactionStatus.mockResolvedValueOnce(
      {
        agencyTrackingId: "existing-id",
        clientName: mockClient.clientName,
        transactionReferenceId: validPetitionRequest.transactionReferenceId,
        transactionStatus: "processing",
        fee: validPetitionRequest.fee,
        paymentStatus: "pending",
        paygovTrackingId: "paygov-123",
        paygovToken: "stale-token",
        createdAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
        lastUpdatedAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
      },
    );

    mockGetDetailsRequest("Failed");

    const result = await initPayment(appContext, {
      client: mockClient,
      request: validPetitionRequest,
    });

    expect(TransactionModel.updateAfterPayGovResponse).not.toHaveBeenCalled();

    expect(TransactionModel.updateToFailedIfNotProcessed).toHaveBeenCalledWith(
      "existing-id",
      "processing",
      expect.any(String),
      5009,
      "PayGov token is not found or expired",
    );
    expect(result.token).toBe(freshPaygovToken);
  });

  const staleTransaction = () => ({
    agencyTrackingId: "existing-id",
    clientName: mockClient.clientName,
    transactionReferenceId: validPetitionRequest.transactionReferenceId,
    fee: validPetitionRequest.fee,
    transactionStatus: "processing",
    paymentStatus: "pending",
    paygovTrackingId: "paygov-123",
    paygovToken: "stale-token",
    createdAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
    lastUpdatedAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
  });

  it.each(["Pending", "Received", "Waiting", "Submitted"] as const)(
    "preserves a settling payment when Pay.gov reports %s",
    async (status) => {
      const TransactionModel = require("../db/TransactionModel").default;
      const row = staleTransaction();
      TransactionModel.findByReferenceIdAndTransactionStatus.mockResolvedValueOnce(row);
      mockGetDetailsRequest(status);

      await expect(initPayment(appContext, {
        client: mockClient,
        request: validPetitionRequest,
      })).rejects.toMatchObject({
        statusCode: 409,
        message: ConflictError.PAYMENT_SETTLING_MESSAGE,
      });

      expect(TransactionModel.updateAfterPayGovResponse).toHaveBeenCalledWith(
        row.agencyTrackingId, row.paygovTrackingId, "pending", "pending", "ach",
        "2026-11-17T16:53:50.789Z", "2026-11-17", "processing", row.lastUpdatedAt,
      );
      expect(TransactionModel.updateToFailedIfNotProcessed).not.toHaveBeenCalled();
      expect(TransactionModel.createReceived).not.toHaveBeenCalled();
    },
  );

  it("rejects a different fee before looking up an existing attempt at Pay.gov", async () => {
    const TransactionModel = require("../db/TransactionModel").default;
    TransactionModel.findByReferenceIdAndTransactionStatus.mockResolvedValueOnce(staleTransaction());
    const details = jest.spyOn(GetDetailsModule.GetRequestRequest.prototype, "makeSoapRequest");

    await expect(initPayment(appContext, {
      client: mockClient,
      request: { ...validPetitionRequest, fee: "NONATTORNEY_EXAM_REGISTRATION_FEE" },
    })).rejects.toMatchObject({
      statusCode: 409,
      message: "The requested fee does not match the existing payment attempt.",
    });
    expect(details).not.toHaveBeenCalled();
    expect(TransactionModel.createReceived).not.toHaveBeenCalled();
  });

  it.each([new ZodError([]), new Error("Connection reset")])(
    "returns a retryable lookup error without mutating the attempt (%s)",
    async (error) => {
      const TransactionModel = require("../db/TransactionModel").default;
      TransactionModel.findByReferenceIdAndTransactionStatus.mockResolvedValueOnce(staleTransaction());
      jest.spyOn(GetDetailsModule.GetRequestRequest.prototype, "makeSoapRequest").mockRejectedValueOnce(error);

      await expect(initPayment(appContext, {
        client: mockClient,
        request: validPetitionRequest,
      })).rejects.toMatchObject({ statusCode: 502 });
      expect(TransactionModel.updateAfterPayGovResponse).not.toHaveBeenCalled();
      expect(TransactionModel.updateToFailedIfNotProcessed).not.toHaveBeenCalled();
      expect(TransactionModel.createReceived).not.toHaveBeenCalled();
    },
  );

  it.each(["Success", "Pending", "Failed"] as const)(
    "does not open a session when the observed attempt changed during lookup (%s)",
    async (status) => {
      const TransactionModel = require("../db/TransactionModel").default;
      TransactionModel.findByReferenceIdAndTransactionStatus.mockResolvedValueOnce(staleTransaction());
      mockGetDetailsRequest(status);
      const conflict = new ConflictError(ConflictError.PERSIST_RACE_MESSAGE);
      if (status === "Failed") {
        TransactionModel.updateToFailedIfNotProcessed.mockRejectedValueOnce(conflict);
      } else {
        TransactionModel.updateAfterPayGovResponse.mockRejectedValueOnce(conflict);
      }

      await expect(initPayment(appContext, {
        client: mockClient,
        request: validPetitionRequest,
      })).rejects.toBe(conflict);
      expect(TransactionModel.createReceived).not.toHaveBeenCalled();
    },
  );
});
