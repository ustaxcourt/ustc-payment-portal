import {
  SORT_ORDERS,
  TRANSACTION_LOG_SORT_FIELDS,
  TransactionLogQuerySchema,
} from "./TransactionLog.schema";

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

  it("preserves explicit sort/order when timeframe is transformed", () => {
    const result = parse({
      from: "08/10/2026",
      to: "08/10/2026",
      sort: "clientName",
      order: "asc",
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      sort: "clientName",
      order: "asc",
    });
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

  it("rejects an ISO datetime without an explicit offset", () => {
    const result = parse({
      from: "2026-08-10T00:00:00",
      to: "2026-08-11T00:00:00",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      "Date must be a valid ISO datetime or MM/DD/YYYY value",
    );
  });

  it("rejects a page size beyond the cap", () => {
    expect(parse({ pageSize: "9999" }).success).toBe(false);
  });

  describe("sorting", () => {
    it("defaults to the newest activity first", () => {
      expect(parse({}).data).toMatchObject({
        sort: "lastUpdatedAt",
        order: "desc",
      });
    });

    it("accepts every column the dashboard offers", () => {
      for (const sort of TRANSACTION_LOG_SORT_FIELDS) {
        for (const order of SORT_ORDERS) {
          expect(parse({ sort, order }).data).toMatchObject({ sort, order });
        }
      }
    });

    // The whitelist is what keeps a column name out of SQL, so an unknown
    // field has to fail parsing rather than fall through to a default.
    it("rejects a column that is not on the whitelist", () => {
      expect(parse({ sort: "paygovToken" }).success).toBe(false);
      expect(
        parse({ sort: "createdAt; drop table transactions" }).success,
      ).toBe(false);
    });

    it("rejects a direction that is not asc or desc", () => {
      expect(parse({ order: "sideways" }).success).toBe(false);
    });
  });
});
