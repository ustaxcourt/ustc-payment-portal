import { initPayment } from "./initPayment";
import { testAppContext as appContext } from "../test/testAppContext";
import { InitPaymentRequest } from "../schemas/InitPayment.schema";
import * as fees from "../fees";
import * as SoapRequestModule from "../entities/StartOnlineCollectionRequest";
import { PayGovError } from "../errors/payGovError";

const validPetitionRequest: InitPaymentRequest = {
  transactionReferenceId: "550e8400-e29b-41d4-a716-446655440000",
  feeId: "PETITION_FILING_FEE",
  urlSuccess: "https://example.com/success",
  urlCancel: "https://example.com/cancel",
  metadata: { docketNumber: "123-26" },
};

const mockSoapRequest = (token: string) => {
  jest.spyOn(SoapRequestModule.StartOnlineCollectionRequest.prototype, "makeSoapRequest")
    .mockResolvedValueOnce({ token });
};

describe("initPayment", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns a token and paymentRedirect for a valid PETITION_FILING_FEE request", async () => {
    mockSoapRequest("test-token-123");
    const result = await initPayment(appContext, validPetitionRequest);
    expect(result.token).toBe("test-token-123");
    expect(result.paymentRedirect).toContain("test-token-123");
    expect(result.paymentRedirect).toContain("TCSUSTAXCOURTPETITION");
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
    });
    expect(result.token).toBe("test-token-456");
    expect(result.paymentRedirect).toContain("TCSUSTAXCOURTANAEF");
  });

  it("throws InvalidRequestError when amount is missing for a variable fee", async () => {
    jest.spyOn(fees, "getFeeConfig").mockResolvedValueOnce({
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

  it("throws InvalidRequestError when feeId is unknown", async () => {
    jest.spyOn(fees, "getFeeConfig").mockResolvedValueOnce(undefined);
    await expect(
      initPayment(appContext, validPetitionRequest)
    ).rejects.toThrow(`Unknown feeId: ${validPetitionRequest.feeId}`);
  });

  it("throws PayGovError when Pay.gov SOAP request fails with a network error", async () => {
    const networkError = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    jest.spyOn(SoapRequestModule.StartOnlineCollectionRequest.prototype, "makeSoapRequest")
      .mockRejectedValueOnce(networkError);
    await expect(
      initPayment(appContext, validPetitionRequest)
    ).rejects.toThrow(PayGovError);
  });

  it("rethrows non-network errors from makeSoapRequest", async () => {
    const parseError = new TypeError("Unexpected token in XML");
    jest.spyOn(SoapRequestModule.StartOnlineCollectionRequest.prototype, "makeSoapRequest")
      .mockRejectedValueOnce(parseError);
    await expect(
      initPayment(appContext, validPetitionRequest)
    ).rejects.toThrow(parseError);
  });
});
