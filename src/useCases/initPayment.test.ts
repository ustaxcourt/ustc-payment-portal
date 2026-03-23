import { initPayment } from "./initPayment";
import { InvalidRequestError } from "../errors/invalidRequest";
import { testAppContext as appContext } from "../test/testAppContext";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const VALID_URLS = {
  urlSuccess: "https://example.com/success",
  urlCancel: "https://example.com/cancel",
};

const validPetitionRequest = {
  transactionReferenceId: VALID_UUID,
  feeId: "PETITION_FILING_FEE",
  ...VALID_URLS,
  metadata: { docketNumber: "123-26" },
};

describe("initPayment", () => {
  it("returns a 200 stub for a valid PETITION_FILING_FEE request", async () => {
    const result = await initPayment(appContext, validPetitionRequest);
    expect(result).toBeDefined();
  });

  it("returns a 200 stub for a valid NONATTORNEY_EXAM_REGISTRATION_FEE request", async () => {
    const result = await initPayment(appContext, {
      transactionReferenceId: VALID_UUID,
      feeId: "NONATTORNEY_EXAM_REGISTRATION_FEE",
      ...VALID_URLS,
      metadata: {
        email: "applicant@example.com",
        fullName: "John Doe",
        accessCode: "ABC123",
      },
    });
    expect(result).toBeDefined();
  });

  it("throws InvalidRequestError when transactionReferenceId is not a UUID", async () => {
    await expect(
      initPayment(appContext, {
        ...validPetitionRequest,
        transactionReferenceId: "not-a-uuid",
      })
    ).rejects.toThrow(InvalidRequestError);
  });

  it("throws InvalidRequestError when feeId is unrecognized", async () => {
    await expect(
      initPayment(appContext, {
        ...validPetitionRequest,
        feeId: "UNKNOWN_FEE",
      })
    ).rejects.toThrow(InvalidRequestError);
  });

  it("throws InvalidRequestError when amount is supplied for a non-variable fee", async () => {
    await expect(
      initPayment(appContext, {
        ...validPetitionRequest,
        amount: 60,
      })
    ).rejects.toThrow("does not allow variable amounts");
  });

  it("throws InvalidRequestError when metadata does not match the feeId", async () => {
    await expect(
      initPayment(appContext, {
        ...validPetitionRequest,
        feeId: "NONATTORNEY_EXAM_REGISTRATION_FEE",
        metadata: { docketNumber: "123-26" },
      })
    ).rejects.toThrow(InvalidRequestError);
  });

  it("throws InvalidRequestError when metadata is missing", async () => {
    const { metadata: _, ...withoutMetadata } = validPetitionRequest;
    await expect(
      initPayment(appContext, withoutMetadata)
    ).rejects.toThrow(InvalidRequestError);
  });
});
