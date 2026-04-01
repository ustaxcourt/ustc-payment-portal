jest.mock("../db/TransactionModel", () => ({
  __esModule: true,
  default: {
    createReceived: jest.fn((data) => Promise.resolve({ ...data, agencyTrackingId: data.agencyTrackingId || "MOCK-TRACKING-ID" })),
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

const validPetitionRequest: InitPaymentRequest & { clientName: string } = {
  transactionReferenceId: "550e8400-e29b-41d4-a716-446655440000",
  feeId: "PETITION_FILING_FEE",
  urlSuccess: "https://example.com/success",
  urlCancel: "https://example.com/cancel",
  metadata: { docketNumber: "123-26" },
  clientName: "Test Client App",
};

const mockSoapRequest = (token: string) => {
  jest.spyOn(SoapRequestModule.StartOnlineCollectionRequest.prototype, "makeSoapRequest")
    .mockResolvedValueOnce({ token });
};

describe("initPayment", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("throws InvalidRequestError with a clear message when feeId is unrecognized", async () => {
    await expect(
      initPayment(appContext, {
        transactionReferenceId: "550e8400-e29b-41d4-a716-446655440000",
        feeId: "UNKNOWN_FEE" as any,
        urlCancel: "https://example.com/cancel",
        urlSuccess: "https://example.com/success",
        metadata: { docketNumber: "123-26" },
        clientName: "Test Client App",
      }),
    ).rejects.toThrow("Unknown feeId: UNKNOWN_FEE");
  });

  it("returns a token and paymentRedirect for a valid PETITION_FILING_FEE request", async () => {
    mockSoapRequest("test-token-123");
    const TransactionModel = require("../db/TransactionModel").default;

    const result = await initPayment(appContext, validPetitionRequest);

    expect(result.token).toBe("test-token-123");
    expect(result.paymentRedirect).toContain("test-token-123");
    expect(result.paymentRedirect).toContain("TCSUSTAXCOURTPETITION");
    expect(TransactionModel.createReceived).toHaveBeenCalled();
    expect(TransactionModel.updateToInitiated).toHaveBeenCalled();
  });

  it("returns a token and paymentRedirect for a valid NONATTORNEY_EXAM_REGISTRATION_FEE request", async () => {
    mockSoapRequest("test-token-456");
    const result = await initPayment(appContext, {
      transactionReferenceId: "550e8400-e29b-41d4-a716-446655440000",
      feeId: "NONATTORNEY_EXAM_REGISTRATION_FEE",
      urlSuccess: "https://example.com/success",
      urlCancel: "https://example.com/cancel",
      metadata: {
        email: "applicant@example.com",
        fullName: "John Doe",
        accessCode: "ABC123",
      },
      clientName: "Test Client App",
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
      initPayment(appContext, validPetitionRequest)
    ).rejects.toThrow("requires an amount");
  });

  it("throws InvalidRequestError when amount is supplied for a non-variable fee", async () => {
    await expect(
      initPayment(appContext, { ...validPetitionRequest, amount: 60 })
    ).rejects.toThrow("does not allow variable amounts");
  });

  it("updates transaction to failed if SOAP request fails", async () => {
    jest.spyOn(SoapRequestModule.StartOnlineCollectionRequest.prototype, "makeSoapRequest")
      .mockRejectedValueOnce(new Error("SOAP error"));
    const TransactionModel = require("../db/TransactionModel").default;

    await expect(
      initPayment(appContext, validPetitionRequest)
    ).rejects.toThrow("Failed to initiate payment: SOAP error");
    expect(TransactionModel.createReceived).toHaveBeenCalled();
    expect(TransactionModel.updateToFailed).toHaveBeenCalled();
  });
});
