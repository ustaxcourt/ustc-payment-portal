import {
  SORT_ORDERS,
  TRANSACTION_LOG_SORT_FIELDS,
  TransactionLogQuerySchema,
  TransactionLogResponseSchema,
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

  describe("includeTotals", () => {
    it("stays off when it is not asked for", () => {
      expect(parse({}).data?.includeTotals).toBe(false);
    });

    it('turns on for the string "true"', () => {
      expect(parse({ includeTotals: "true" }).data?.includeTotals).toBe(true);
    });

    // z.coerce.boolean() would switch totals *on* here.
    it('stays off for the string "false"', () => {
      expect(parse({ includeTotals: "false" }).data?.includeTotals).toBe(false);
    });

    it("rejects a value that is neither true nor false", () => {
      expect(parse({ includeTotals: "yes" }).success).toBe(false);
    });
  });
});

describe("TransactionLogResponseSchema", () => {
  const period = {
    from: "2026-08-17T04:00:00.000Z",
    to: "2026-08-17T15:00:00.000Z",
    total: 12450,
  };

  const response = {
    data: [],
    counts: { all: 0, success: 0, failed: 0, pending: 0 },
    from: FROM,
    to: TO,
    page: 1,
    pageSize: 50,
    sort: "lastUpdatedAt",
    order: "desc",
    total: 0,
  };

  it("parses without totals, so existing callers are unaffected", () => {
    const result = TransactionLogResponseSchema.safeParse(response);

    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("totals");
  });

  it("parses with a total for each of the five periods", () => {
    const result = TransactionLogResponseSchema.safeParse({
      ...response,
      totals: {
        day: period,
        week: period,
        month: period,
        quarter: period,
        fiscalYear: period,
      },
    });

    expect(result.success).toBe(true);
    expect(result.data?.totals?.fiscalYear.total).toBe(12450);
  });

  it("rejects totals missing a period", () => {
    const result = TransactionLogResponseSchema.safeParse({
      ...response,
      totals: { day: period },
    });

    expect(result.success).toBe(false);
  });

  it("rejects a negative total", () => {
    const result = TransactionLogResponseSchema.safeParse({
      ...response,
      totals: {
        day: { ...period, total: -1 },
        week: period,
        month: period,
        quarter: period,
        fiscalYear: period,
      },
    });

    expect(result.success).toBe(false);
  });
});

describe("TransactionLogResponseSchema", () => {
  const counts = { all: 47, success: 40, failed: 4, pending: 3 };
  const page = {
    data: [],
    from: "2026-08-01T00:00:00.000Z",
    to: "2026-08-02T00:00:00.000Z",
    page: 2,
    pageSize: 5000,
    sort: "lastUpdatedAt",
    order: "desc",
  };

  it("accepts the totals present together or omitted together", () => {
    expect(
      TransactionLogResponseSchema.safeParse({ ...page, counts, total: 47 })
        .success,
    ).toBe(true);
    expect(TransactionLogResponseSchema.safeParse(page).success).toBe(true);
  });

  it("rejects one of the pair without the other", () => {
    expect(
      TransactionLogResponseSchema.safeParse({ ...page, counts }).success,
    ).toBe(false);
    expect(
      TransactionLogResponseSchema.safeParse({ ...page, total: 47 }).success,
    ).toBe(false);
  });
});
