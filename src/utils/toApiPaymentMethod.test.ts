import { toApiPaymentMethod, toDbPaymentMethod } from "./toApiPaymentMethod";

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
});

describe("toDbPaymentMethod", () => {
  it.each([
    ["Credit/Debit Card", "plastic_card"],
    ["ACH", "ach"],
    ["PayPal", "paypal"],
  ] as const)("maps %s to %s", (api, db) => {
    expect(toDbPaymentMethod(api)).toBe(db);
  });

  it("returns undefined when method is null", () => {
    expect(toDbPaymentMethod(null)).toBeUndefined();
  });

  it("returns undefined when method is undefined", () => {
    expect(toDbPaymentMethod(undefined)).toBeUndefined();
  });

  it("round-trips with toApiPaymentMethod for every stored value", () => {
    for (const db of ["plastic_card", "ach", "paypal"] as const) {
      expect(toDbPaymentMethod(toApiPaymentMethod(db))).toBe(db);
    }
  });
});
