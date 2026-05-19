import { PayGovGetDetailsResponseSchema } from "./PayGovGetDetailsResponse.schema";

describe("PayGovGetDetailsResponseSchema", () => {
  const validTransaction = {
    paygov_tracking_id: "TRK1234567890123456AB",
    agency_tracking_id: "agency-1",
    transaction_amount: 60,
    transaction_status: "Success",
  };

  it("accepts a single transaction wrapper", () => {
    const result = PayGovGetDetailsResponseSchema.safeParse({
      transactions: { transaction: validTransaction },
    });
    expect(result.success).toBe(true);
  });

  it("accepts an array of transaction wrappers", () => {
    const result = PayGovGetDetailsResponseSchema.safeParse({
      transactions: [{ transaction: validTransaction }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty transactions array", () => {
    const result = PayGovGetDetailsResponseSchema.safeParse({ transactions: [] });
    expect(result.success).toBe(false);
  });

  it("rejects a string transaction_amount (catches XML-parser misconfiguration)", () => {
    const result = PayGovGetDetailsResponseSchema.safeParse({
      transactions: {
        transaction: { ...validTransaction, transaction_amount: "60.00" },
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unrecognized transaction_status", () => {
    const result = PayGovGetDetailsResponseSchema.safeParse({
      transactions: {
        transaction: { ...validTransaction, transaction_status: "Unknown" },
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects when required fields are missing", () => {
    const { paygov_tracking_id: _omit, ...rest } = validTransaction;
    const result = PayGovGetDetailsResponseSchema.safeParse({
      transactions: { transaction: rest },
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional payment_type, transaction_date, payment_date", () => {
    const result = PayGovGetDetailsResponseSchema.safeParse({
      transactions: {
        transaction: {
          ...validTransaction,
          payment_type: "ACH",
          transaction_date: "2026-01-15T10:30:00",
          payment_date: "2026-01-16",
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed transaction_date", () => {
    const result = PayGovGetDetailsResponseSchema.safeParse({
      transactions: {
        transaction: { ...validTransaction, transaction_date: "not-a-date" },
      },
    });
    expect(result.success).toBe(false);
  });
});
