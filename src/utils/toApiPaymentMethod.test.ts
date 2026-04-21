import { toApiPaymentMethod } from "./toApiPaymentMethod";

describe("toApiPaymentMethod", () => {
  it("maps plastic_card to Credit/Debit Card", () => {
    expect(toApiPaymentMethod("plastic_card")).toBe("Credit/Debit Card");
  });

  it("maps ach to ACH", () => {
    expect(toApiPaymentMethod("ach")).toBe("ACH");
  });

  it("maps paypal to PayPal", () => {
    expect(toApiPaymentMethod("paypal")).toBe("PayPal");
  });

  it("returns undefined for null", () => {
    expect(toApiPaymentMethod(null)).toBeUndefined();
  });

  it("returns undefined for undefined", () => {
    expect(toApiPaymentMethod(undefined)).toBeUndefined();
  });
});
