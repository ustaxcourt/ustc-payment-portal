import { PaymentMethod as DbPaymentMethod } from "../db/TransactionModel";
import { toApiPaymentMethod } from "./toApiPaymentMethod";

describe("toApiPaymentMethod", () => {
  it.each([
    ["plastic_card", "Credit/Debit Card"],
    ["ach", "ACH"],
    ["paypal", "PayPal"],
  ] as const)("maps %s to %s", (db, api) => {
    expect(toApiPaymentMethod(db)).toBe(api);
  });

  it("returns undefined when method is null", () => {
    expect(toApiPaymentMethod(null)).toBeUndefined();
  });

  it("returns undefined when method is undefined", () => {
    expect(toApiPaymentMethod(undefined)).toBeUndefined();
  });

  it("throws when method is an unrecognized value", () => {
    expect(() =>
      toApiPaymentMethod("venmo" as DbPaymentMethod),
    ).toThrow("Unknown payment method: venmo");
  });
});
