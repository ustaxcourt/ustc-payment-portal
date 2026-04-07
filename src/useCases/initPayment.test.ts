import { initPayment } from "./initPayment";
import { testAppContext as appContext } from "../test/testAppContext";
import { InitPaymentInternalRequest } from "../schemas/InitPayment.schema";
import * as fees from "../fees";
import * as SoapRequestModule from "../entities/StartOnlineCollectionRequest";
import TransactionModel from "../db/TransactionModel";

const validPetitionRequest: InitPaymentInternalRequest = {
  transactionReferenceId: "550e8400-e29b-41d4-a716-446655440000",
  feeId: "PETITION_FILING_FEE",
  urlSuccess: "https://example.com/success",
  urlCancel: "https://example.com/cancel",
  metadata: { docketNumber: "123-26" },
  clientName: "DAWSON",
};

const mockSoapRequest = (token: string) => {
  jest.spyOn(SoapRequestModule.StartOnlineCollectionRequest.prototype, "makeSoapRequest")
    .mockResolvedValueOnce({ token });
};

const mockDb = () => {
  jest.spyOn(TransactionModel, "createReceived").mockResolvedValue({} as TransactionModel);
  jest.spyOn(TransactionModel, "updateToInitiated").mockResolvedValue();
  jest.spyOn(TransactionModel, "updateToFailed").mockResolvedValue();
};

describe("initPayment", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns a token and paymentRedirect for a valid PETITION_FILING_FEE request", async () => {
    mockDb();
    mockSoapRequest("test-token-123");
    const result = await initPayment(appContext, validPetitionRequest);
    expect(result.token).toBe("test-token-123");
    expect(result.paymentRedirect).toContain("test-token-123");
    expect(result.paymentRedirect).toContain("TCSUSTAXCOURTPETITION");
  });

  it("returns a token and paymentRedirect for a valid NONATTORNEY_EXAM_REGISTRATION_FEE request", async () => {
    mockDb();
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
      clientName: "DAWSON",
    });
    expect(result.token).toBe("test-token-456");
    expect(result.paymentRedirect).toContain("TCSUSTAXCOURTANAEF");
  });

  it("throws InvalidRequestError when amount is missing for a variable fee", async () => {
    jest.spyOn(fees, "getFeeConfig").mockResolvedValueOnce({
      feeId: "PETITION_FILING_FEE",
      feeName: "Petition Filing Fee",
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

  it("throws PayGovError when SOAP call fails", async () => {
    mockDb();
    jest.spyOn(SoapRequestModule.StartOnlineCollectionRequest.prototype, "makeSoapRequest")
      .mockRejectedValueOnce(new Error("SOAP timeout"));

    await expect(
      initPayment(appContext, validPetitionRequest)
    ).rejects.toMatchObject({ name: "PayGovError" });
  });

  it("does not call updateToFailed when createReceived fails", async () => {
    const updateToFailedSpy = jest.spyOn(TransactionModel, "updateToFailed").mockResolvedValue();
    jest.spyOn(TransactionModel, "createReceived").mockRejectedValueOnce(new Error("DB connection error"));

    await expect(
      initPayment(appContext, validPetitionRequest)
    ).rejects.toThrow();

    expect(updateToFailedSpy).not.toHaveBeenCalled();
  });

  it("calls updateToFailed when SOAP call fails after DB record is created", async () => {
    const updateToFailedSpy = jest.spyOn(TransactionModel, "updateToFailed").mockResolvedValue();
    jest.spyOn(TransactionModel, "createReceived").mockResolvedValue({} as TransactionModel);
    jest.spyOn(SoapRequestModule.StartOnlineCollectionRequest.prototype, "makeSoapRequest")
      .mockRejectedValueOnce(new Error("SOAP error"));

    await expect(
      initPayment(appContext, validPetitionRequest)
    ).rejects.toMatchObject({ name: "PayGovError" });

    expect(updateToFailedSpy).toHaveBeenCalled();
  });
});
