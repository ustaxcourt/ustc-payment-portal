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

  it("rejects a page size beyond the cap", () => {
    expect(parse({ pageSize: "9999" }).success).toBe(false);
  });

  describe("export", () => {
    it("defaults to a non-export request", () => {
      expect(parse({}).data).toMatchObject({ export: false });
    });

    it("accepts an export page size the dashboard cap would refuse", () => {
      const result = parse({ export: "true", pageSize: "5000" });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ export: true, pageSize: 5000 });
    });

    it("rejects a large page size without the export flag", () => {
      const result = parse({ pageSize: "5000" });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe(
        "`pageSize` above 200 requires `export=true`",
      );
    });

    it("caps export pages too", () => {
      expect(parse({ export: "true", pageSize: "5001" }).success).toBe(false);
    });

    it("rejects anything but true or false", () => {
      expect(parse({ export: "1" }).success).toBe(false);
      expect(parse({ export: "yes" }).success).toBe(false);
    });
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
      expect(parse({ sort: "createdAt; drop table transactions" }).success).toBe(
        false,
      );
    });

    it("rejects a direction that is not asc or desc", () => {
      expect(parse({ order: "sideways" }).success).toBe(false);
    });
  });
});
