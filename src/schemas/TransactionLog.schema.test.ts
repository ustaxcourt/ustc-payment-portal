import { TransactionLogQuerySchema } from "./TransactionLog.schema";

const parse = (query: Record<string, string>) =>
  TransactionLogQuerySchema.safeParse(query);

const FROM = "2026-08-01T00:00:00Z";
const TO = "2026-08-02T00:00:00Z";

describe("TransactionLogQuerySchema", () => {
  it("defaults the page when no timeframe is given", () => {
    const result = parse({});

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ page: 1, pageSize: 50 });
    expect(result.data?.from).toBeUndefined();
    expect(result.data?.to).toBeUndefined();
  });

  it("accepts a complete timeframe", () => {
    expect(parse({ from: FROM, to: TO }).success).toBe(true);
  });

  it("accepts an inclusive same-day MM/DD/YYYY range", () => {
    const result = parse({ from: "08/10/2026", to: "08/10/2026" });

    expect(result.success).toBe(true);
    if (!result.success || !("from" in result.data) || !("to" in result.data)) {
      throw new Error("Expected query to parse successfully");
    }

    const datedQuery = result.data as { from: Date; to: Date };
    expect(datedQuery.from.toISOString()).toBe("2026-08-10T04:00:00.000Z");
    expect(datedQuery.to.toISOString()).toBe("2026-08-11T04:00:00.000Z");
  });

  it("accepts mixed MM/DD/YYYY and ISO inputs", () => {
    const result = parse({
      from: "08/10/2026",
      to: "2026-08-11T04:00:00.000Z",
    });

    expect(result.success).toBe(true);
  });

  it.each([
    ["from", { from: FROM }],
    ["to", { to: TO }],
  ])("rejects %s without its pair", (_side, query) => {
    const result = parse(query);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      "`from` and `to` must be supplied together",
    );
  });

  it("rejects an inverted timeframe", () => {
    const result = parse({ from: TO, to: FROM });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      "`from` must be earlier than `to`",
    );
  });

  it("rejects an inverted MM/DD/YYYY timeframe", () => {
    const result = parse({ from: "08/11/2026", to: "08/10/2026" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      "`from` must be on or before `to`",
    );
  });

  it("rejects an invalid MM/DD/YYYY date", () => {
    const result = parse({ from: "02/30/2026", to: "08/10/2026" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      "Date must be a valid ISO datetime or MM/DD/YYYY value",
    );
  });

  it("rejects a page size beyond the cap", () => {
    expect(parse({ pageSize: "9999" }).success).toBe(false);
  });
});
