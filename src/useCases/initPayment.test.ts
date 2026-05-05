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

  it("throws when an in-flight initiated transaction is missing its Pay.gov token", async () => {
    const TransactionModel = require("../db/TransactionModel").default;
    TransactionModel.findInFlightByReferenceId.mockResolvedValueOnce({
      agencyTrackingId: "existing-id",
      clientName: mockClient.clientName,
      transactionReferenceId: validPetitionRequest.transactionReferenceId,
      transactionStatus: "initiated",
      paygovToken: null,
      lastUpdatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
    });

    await expect(
      initPayment(appContext, { client: mockClient, request: validPetitionRequest }),
    ).rejects.toThrow(`In-flight transaction ${validPetitionRequest.transactionReferenceId} is missing a Pay.gov token`);
    expect(TransactionModel.createReceived).not.toHaveBeenCalled();
  });

  it("marks expired in-flight transaction as failed and creates a new one when token age >= 3 hours", async () => {
    mockSoapRequest("new-token-xyz");
    const TransactionModel = require("../db/TransactionModel").default;
    TransactionModel.findInFlightByReferenceId.mockResolvedValueOnce({
      agencyTrackingId: "existing-id",
      clientName: mockClient.clientName,
      transactionReferenceId: validPetitionRequest.transactionReferenceId,
      transactionStatus: "initiated",
      paygovToken: "existing-token-abc",
      lastUpdatedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), // 4 hours ago
    });

    const result = await initPayment(appContext, {
      client: mockClient,
      request: validPetitionRequest,
    });

    expect(TransactionModel.updateToFailed).toHaveBeenCalledWith("existing-id", 5009, "Existing token expired");
    expect(TransactionModel.createReceived).toHaveBeenCalled();
    expect(result.token).toBe("new-token-xyz");
  });

  it("throws ConflictError when createReceived fails with a pg unique_violation (partial unique index race)", async () => {
    const TransactionModel = require("../db/TransactionModel").default;
    // App-level check passes (no existing initiated row visible), but the concurrent
    // peer wins the createReceived race and our insert violates the partial unique index.
    TransactionModel.findInFlightByReferenceId.mockResolvedValueOnce(undefined);
    const uniqueViolation = Object.assign(
      new Error('duplicate key value violates unique constraint "idx_transactions_unique_active"'),
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
    TransactionModel.createReceived.mockRejectedValueOnce(new Error("connection refused"));

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
