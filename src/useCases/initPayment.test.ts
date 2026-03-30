import { initPayment } from "./initPayment";
import { testAppContext as appContext } from "../test/testAppContext";
import { InitPaymentRequest } from "../schemas/InitPayment.schema";
import * as fees from "../fees";

const validPetitionRequest: InitPaymentRequest = {
  transactionReferenceId: "550e8400-e29b-41d4-a716-446655440000",
  feeId: "PETITION_FILING_FEE",
  urlSuccess: "https://example.com/success",
  urlCancel: "https://example.com/cancel",
  metadata: { docketNumber: "123-26" },
};

describe("initPayment", () => {
  it("returns a stub response for a valid PETITION_FILING_FEE request", async () => {
    const result = await initPayment(appContext, validPetitionRequest);
    expect(result).toBeDefined();
  });

  it("returns a stub response for a valid NONATTORNEY_EXAM_REGISTRATION_FEE request", async () => {
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
    expect(result).toBeDefined();
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

    jest.restoreAllMocks();
  });

  it("throws InvalidRequestError when amount is supplied for a non-variable fee", async () => {
    await expect(
      initPayment(appContext, { ...validPetitionRequest, amount: 60 })
    ).rejects.toThrow("does not allow variable amounts");
  });
});
