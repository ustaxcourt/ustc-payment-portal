import { CompleteOnlineCollectionWithDetailsResponseSchema } from "./CompleteOnlineCollectionWithDetailsResponse.schema";

const validResponse = {
  paygov_tracking_id: "25PC41EF",
  agency_tracking_id: "1452545972102",
  transaction_amount: 32.01,
  transaction_date: "2016-01-11T16:01:46",
  payment_date: "2016-01-11",
  transaction_status: "Success" as const,
  payment_type: "PLASTIC_CARD",
};

describe("CompleteOnlineCollectionWithDetailsResponseSchema", () => {
  it("accepts a valid Pay.gov response", () => {
    const result = CompleteOnlineCollectionWithDetailsResponseSchema.safeParse(validResponse);
    expect(result.success).toBe(true);
  });

  describe("transaction_date", () => {
    it("accepts Pay.gov's observed dev format with milliseconds and Z suffix", () => {
      const result = CompleteOnlineCollectionWithDetailsResponseSchema.safeParse({
        ...validResponse,
        transaction_date: "2026-04-21T15:04:55.362Z",
      });
      expect(result.success).toBe(true);
    });

    it("accepts a datetime with numeric timezone offset", () => {
      const result = CompleteOnlineCollectionWithDetailsResponseSchema.safeParse({
        ...validResponse,
        transaction_date: "2026-04-21T15:04:55-05:00",
      });
      expect(result.success).toBe(true);
    });

    it("rejects a date-only string", () => {
      const result = CompleteOnlineCollectionWithDetailsResponseSchema.safeParse({
        ...validResponse,
        transaction_date: "2016-01-11",
      });
      expect(result.success).toBe(false);
    });

    it("rejects a non-date string", () => {
      const result = CompleteOnlineCollectionWithDetailsResponseSchema.safeParse({
        ...validResponse,
        transaction_date: "not-a-date",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("payment_date", () => {
    it("rejects a datetime string", () => {
      const result = CompleteOnlineCollectionWithDetailsResponseSchema.safeParse({
        ...validResponse,
        payment_date: "2016-01-11T16:01:46",
      });
      expect(result.success).toBe(false);
    });

    it("rejects a non-date string", () => {
      const result = CompleteOnlineCollectionWithDetailsResponseSchema.safeParse({
        ...validResponse,
        payment_date: "yesterday",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("transaction_status", () => {
    it("rejects values outside the Pay.gov enum", () => {
      const result = CompleteOnlineCollectionWithDetailsResponseSchema.safeParse({
        ...validResponse,
        transaction_status: "Approved",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("payment_type", () => {
    it("accepts any string (normalization is handled by toPaymentMethod)", () => {
      const result = CompleteOnlineCollectionWithDetailsResponseSchema.safeParse({
        ...validResponse,
        payment_type: "BITCOIN",
      });
      expect(result.success).toBe(true);
    });
  });
});
