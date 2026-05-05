jest.mock("../db/TransactionModel", () => ({
  __esModule: true,
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
}));

jest.mock("../db/FeesModel", () => ({
  __esModule: true,
  default: {
    getFeeById: jest.fn((feeId) => {
      if (feeId === "PETITION_FILING_FEE") {
        return Promise.resolve({
          feeId: "PETITION_FILING_FEE",
          tcsAppId: "TCSUSTAXCOURTPETITION",
          amount: 250,
          isVariable: false,
        });
      }
      if (feeId === "NONATTORNEY_EXAM_REGISTRATION_FEE") {
        return Promise.resolve({
          feeId: "NONATTORNEY_EXAM_REGISTRATION_FEE",
          tcsAppId: "TCSUSTAXCOURTANAEF",
          amount: 250,
          isVariable: false,
        });
      }
      return Promise.resolve(undefined);
    }),
  },
}));

import { initPayment } from "./initPayment";
import { testAppContext as appContext } from "../test/testAppContext";
import { InitPaymentRequest } from "../schemas/InitPayment.schema";
import * as SoapRequestModule from "../entities/StartOnlineCollectionRequest";
import { ConflictError } from "../errors/conflict";
import { PayGovError } from "../errors/payGovError";
import { ClientPermission } from "../types/ClientPermission";
import { createRequestLogger } from "../utils/logger";

const mockClient: ClientPermission = {
  clientName: "Test Client App",
  clientRoleArn: "arn:aws:iam::123456789012:role/test-client",
  allowedFeeIds: ["*"],
};

const validPetitionRequest: InitPaymentRequest = {
  transactionReferenceId: "550e8400-e29b-41d4-a716-446655440000",
  feeId: "PETITION_FILING_FEE",
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

  it("throws InvalidRequestError with a clear message when feeId is unrecognized", async () => {
    await expect(
      initPayment(appContext, {
        client: mockClient,
        request: {
          transactionReferenceId: "550e8400-e29b-41d4-a716-446655440000",
          feeId: "UNKNOWN_FEE" as any,
          urlCancel: "https://example.com/cancel",
          urlSuccess: "https://example.com/success",
          metadata: { docketNumber: "123-26" },
        },
      }),
    ).rejects.toThrow("Unknown feeId: UNKNOWN_FEE");
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
    expect(TransactionModel.createReceived).toHaveBeenCalled();
    expect(TransactionModel.updateToInitiated).toHaveBeenCalled();
  });

  it("calls requestLogger when provided", async () => {
    mockSoapRequest("test-token-logger");

    const childInfo = jest.fn();
    const childError = jest.fn();
    const mockRequestLogger = {
      info: jest.fn(),
      error: jest.fn(),
      child: jest.fn().mockReturnValue({
        info: childInfo,
        error: childError,
      }),
    };

    await initPayment(appContext, {
      client: mockClient,
      request: validPetitionRequest,
      requestLogger: mockRequestLogger as unknown as ReturnType<
        typeof createRequestLogger
      >,
    });

    expect(mockRequestLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        requestParams: expect.objectContaining({
          feeId: "PETITION_FILING_FEE",
          transactionReferenceId: "550e8400-e29b-41d4-a716-446655440000",
          urlSuccessOrigin: "https://example.com",
          urlCancelOrigin: "https://example.com",
          metadataKeys: ["docketNumber"],
        }),
      }),
      "initPayment use case started",
    );
    expect(mockRequestLogger.child).toHaveBeenCalledWith(
      expect.objectContaining({ agencyTrackingId: expect.any(String) }),
    );
    expect(childInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        requestParams: expect.objectContaining({
          feeId: "PETITION_FILING_FEE",
          transactionReferenceId: "550e8400-e29b-41d4-a716-446655440000",
          metadataKeys: ["docketNumber"],
        }),
      }),
      "Persisted received transaction with generated agency tracking id",
    );
    expect(childInfo).toHaveBeenCalledWith(
      "Pay.gov startOnlineCollection completed",
    );
    expect(childInfo).toHaveBeenCalledWith("Persisted initiated transaction");
    expect(childInfo).toHaveBeenCalledWith("initPayment use case completed");
    expect(childError).not.toHaveBeenCalled();
  });

  it("returns a token and paymentRedirect for a valid NONATTORNEY_EXAM_REGISTRATION_FEE request", async () => {
    mockSoapRequest("test-token-456");
    const result = await initPayment(appContext, {
      client: mockClient,
      request: {
        transactionReferenceId: "550e8400-e29b-41d4-a716-446655440000",
        feeId: "NONATTORNEY_EXAM_REGISTRATION_FEE",
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
  });

  it("throws InvalidRequestError when amount is missing for a variable fee", async () => {
    const FeesModel = require("../db/FeesModel").default;
    FeesModel.getFeeById.mockResolvedValueOnce({
      feeId: "PETITION_FILING_FEE",
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

  it.each(["received", "initiated", "pending"] as const)(
    "throws ConflictError when an in-flight transaction (%s) already exists for the same client and reference id",
    async (status) => {
      const TransactionModel = require("../db/TransactionModel").default;
      TransactionModel.findInFlightByReferenceId.mockResolvedValueOnce({
        agencyTrackingId: "existing-id",
        clientName: mockClient.clientName,
        transactionReferenceId: validPetitionRequest.transactionReferenceId,
        transactionStatus: status,
      });

      await expect(
        initPayment(appContext, {
          client: mockClient,
          request: validPetitionRequest,
        }),
      ).rejects.toThrow(ConflictError);

      expect(TransactionModel.createReceived).not.toHaveBeenCalled();
    },
  );

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

    await expect(
      initPayment(appContext, {
        client: mockClient,
        request: validPetitionRequest,
      }),
    ).rejects.toThrow("SOAP error");
    expect(TransactionModel.createReceived).toHaveBeenCalled();
    expect(TransactionModel.updateToFailed).toHaveBeenCalled();
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
    await expect(
      initPayment(appContext, {
        client: mockClient,
        request: validPetitionRequest,
      }),
    ).rejects.toThrow(PayGovError);
  });

  it("rethrows non-network errors from makeSoapRequest", async () => {
    const parseError = new TypeError("Unexpected token in XML");
    jest
      .spyOn(
        SoapRequestModule.StartOnlineCollectionRequest.prototype,
        "makeSoapRequest",
      )
      .mockRejectedValueOnce(parseError);
    await expect(
      initPayment(appContext, {
        client: mockClient,
        request: validPetitionRequest,
      }),
    ).rejects.toThrow(parseError);
  });
});
