jest.mock("../db/TransactionModel", () => {
  const actual = jest.requireActual("../db/TransactionModel");
  return {
    __esModule: true,
    ...actual,
    default: {
      findInFlightByReferenceId: jest.fn(() => Promise.resolve(undefined)),
      createReceived: jest.fn((data) =>
        Promise.resolve({
          ...data,
          agencyTrackingId: data.agencyTrackingId || "MOCK-TRACKING-ID",
        }),
      ),
      updateToInitiated: jest.fn(() => Promise.resolve()),
      updateToFailed: jest.fn(() => Promise.resolve()),
    },
  };
});

jest.mock("../db/FeesModel", () => ({
  __esModule: true,
  default: {
    getActiveFeeByKey: jest.fn((feeKey) => {
      if (feeKey === "PETITION_FILING_FEE") {
        return Promise.resolve({
          feeId: "PETITION_FILING_FEE",
          feeKey: "PETITION_FILING_FEE",
          tcsAppId: "TCSUSTAXCOURTPETITION",
          amount: 250,
          isVariable: false,
        });
      }
      if (feeKey === "NONATTORNEY_EXAM_REGISTRATION_FEE") {
        return Promise.resolve({
          feeId: "NONATTORNEY_EXAM_REGISTRATION_FEE",
          feeKey: "NONATTORNEY_EXAM_REGISTRATION_FEE",
          tcsAppId: "TCSUSTAXCOURTANAEF",
          amount: 250,
          isVariable: false,
        });
      }
      return Promise.resolve(undefined);
    }),
  },
}));

jest.mock("../health/payGovHealthMetric", () => ({
  emitPayGovErrorMetric: jest.fn(),
}));

import { initPayment } from "./initPayment";
import { testAppContext as appContext } from "../test/testAppContext";
import { InitPaymentRequest } from "@schemas/InitPayment.schema";
import * as SoapRequestModule from "@entities/StartOnlineCollectionRequest";
import { ZodError } from "zod";
import { ConflictError } from "../errors/conflict";
import { PayGovError } from "../errors/payGovError";
import { ClientPermission } from "../types/ClientPermission";
import { emitPayGovErrorMetric } from "../health/payGovHealthMetric";

const emitErrorMock = emitPayGovErrorMetric as jest.MockedFunction<
  typeof emitPayGovErrorMetric
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
          fee: "UNKNOWN_FEE" as any,
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
    expect(result.paymentRedirect).toContain("TCSUSTAXCOURTPETITION");
    expect(TransactionModel.createReceived).toHaveBeenCalledWith(
      expect.objectContaining({ feeId: "PETITION_FILING_FEE" }),
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
      expect.objectContaining({ feeId: "NONATTORNEY_EXAM_REGISTRATION_FEE" }),
    );
  });

  it("throws InvalidRequestError when amount is missing for a variable fee", async () => {
    const FeesModel = require("../db/FeesModel").default;
    FeesModel.getActiveFeeByKey.mockResolvedValueOnce({
      feeId: "PETITION_FILING_FEE",
      feeKey: "PETITION_FILING_FEE",
      tcsAppId: "TCSUSTAXCOURTPETITION",
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

  it("returns the existing token when an in-flight transaction has a fresh token (age < 3 hours)", async () => {
    const TransactionModel = require("../db/TransactionModel").default;
    TransactionModel.findInFlightByReferenceId.mockResolvedValueOnce({
      agencyTrackingId: "existing-id",
      clientName: mockClient.clientName,
      transactionReferenceId: validPetitionRequest.transactionReferenceId,
      transactionStatus: "initiated",
      paygovToken: "existing-token-abc",
      lastUpdatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
    });

    const result = await initPayment(appContext, {
      client: mockClient,
      request: validPetitionRequest,
    });

    expect(result.token).toBe("existing-token-abc");
    expect(result.paymentRedirect).toContain("existing-token-abc");
    expect(TransactionModel.createReceived).not.toHaveBeenCalled();
    expect(TransactionModel.updateToFailed).not.toHaveBeenCalled();
  });

  it("returns the existing token when an attempt is processing (POST /process in flight)", async () => {
    const TransactionModel = require("../db/TransactionModel").default;
    TransactionModel.findInFlightByReferenceId.mockResolvedValueOnce({
      agencyTrackingId: "existing-id",
      clientName: mockClient.clientName,
      transactionReferenceId: validPetitionRequest.transactionReferenceId,
      transactionStatus: "processing",
      paygovToken: "processing-token-abc",
      lastUpdatedAt: new Date().toISOString(),
    });

    const result = await initPayment(appContext, {
      client: mockClient,
      request: validPetitionRequest,
    });

    expect(result.token).toBe("processing-token-abc");
    expect(result.paymentRedirect).toContain("processing-token-abc");
    expect(TransactionModel.createReceived).not.toHaveBeenCalled();
  });

  it("marks stale processing in-flight transaction as failed and creates a new one", async () => {
    const stalePaygovToken = crypto.randomUUID().replace(/-/g, "");
    const freshPaygovToken = crypto.randomUUID().replace(/-/g, "");

    mockSoapRequest(freshPaygovToken);
    const TransactionModel = require("../db/TransactionModel").default;
    TransactionModel.findInFlightByReferenceId.mockResolvedValueOnce({
      agencyTrackingId: "existing-id",
      clientName: mockClient.clientName,
      transactionReferenceId: validPetitionRequest.transactionReferenceId,
      transactionStatus: "processing",
      paygovToken: stalePaygovToken,
      lastUpdatedAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
    });

    const result = await initPayment(appContext, {
      client: mockClient,
      request: validPetitionRequest,
    });

    expect(TransactionModel.updateToFailed).toHaveBeenCalledWith(
      "existing-id",
      5009,
      "Existing token expired",
    );
    expect(TransactionModel.createReceived).toHaveBeenCalled();
    expect(result.token).toBe(freshPaygovToken);
  });

  it("marks expired in-flight transaction as failed and creates a new one when token age >= 3 hours", async () => {
    const expiredPaygovToken = crypto.randomUUID().replace(/-/g, "");
    const freshPaygovToken = crypto.randomUUID().replace(/-/g, "");

    mockSoapRequest(freshPaygovToken);
    const TransactionModel = require("../db/TransactionModel").default;
    TransactionModel.findInFlightByReferenceId.mockResolvedValueOnce({
      agencyTrackingId: "existing-id",
      clientName: mockClient.clientName,
      transactionReferenceId: validPetitionRequest.transactionReferenceId,
      transactionStatus: "initiated",
      paygovToken: expiredPaygovToken,
      lastUpdatedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), // 4 hours ago
    });

    const result = await initPayment(appContext, {
      client: mockClient,
      request: validPetitionRequest,
    });

    expect(TransactionModel.updateToFailed).toHaveBeenCalledWith(
      "existing-id",
      5009,
      "Existing token expired",
    );
    expect(TransactionModel.createReceived).toHaveBeenCalled();
    expect(result.token).toBe(freshPaygovToken);
  });

  it("falls through to create a new transaction when the in-flight record has no Pay.gov token", async () => {
    const freshPaygovToken = crypto.randomUUID().replace(/-/g, "");
    mockSoapRequest(freshPaygovToken);
    const TransactionModel = require("../db/TransactionModel").default;
    TransactionModel.findInFlightByReferenceId.mockResolvedValueOnce({
      agencyTrackingId: "existing-id",
      clientName: mockClient.clientName,
      transactionReferenceId: validPetitionRequest.transactionReferenceId,
      transactionStatus: "initiated",
      paygovToken: null,
      lastUpdatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
    });

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
    TransactionModel.findInFlightByReferenceId.mockResolvedValueOnce(undefined);
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
  });

  it("wraps non-unique-violation createReceived errors as a generic failure", async () => {
    const TransactionModel = require("../db/TransactionModel").default;
    TransactionModel.findInFlightByReferenceId.mockResolvedValueOnce(undefined);
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
});

