import { toPaymentMethod } from "./toPaymentMethod";

describe("toPaymentMethod", () => {
  it("maps PLASTIC_CARD to plastic_card", () => {
    expect(toPaymentMethod("PLASTIC_CARD")).toBe("plastic_card");
  });

  it("maps ACH to ach", () => {
    expect(toPaymentMethod("ACH")).toBe("ach");
  });

  it("maps PAYPAL to paypal", () => {
    expect(toPaymentMethod("PAYPAL")).toBe("paypal");
  });

  it("is case-insensitive", () => {
    expect(toPaymentMethod("plastic_card")).toBe("plastic_card");
    expect(toPaymentMethod("Ach")).toBe("ach");
    expect(toPaymentMethod("PayPal")).toBe("paypal");
  });

  it("returns null for unknown payment types", () => {
    expect(toPaymentMethod("BITCOIN")).toBeNull();
    expect(toPaymentMethod("")).toBeNull();
  });
});
