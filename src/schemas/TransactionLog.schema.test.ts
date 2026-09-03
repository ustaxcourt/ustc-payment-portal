import {
  SORT_ORDERS,
  TRANSACTION_LOG_SORT_FIELDS,
  TransactionLogQuerySchema,
  TransactionLogResponseSchema,
} from "./TransactionLog.schema";
import { mapCourtPeriods } from "@utils/courtDayBounds";

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
      export: "true",
      sort: "clientName",
      order: "asc",
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      export: true,
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
      expect(
        parse({ sort: "createdAt; drop table transactions" }).success,
      ).toBe(false);
    });

    it("rejects a direction that is not asc or desc", () => {
      expect(parse({ order: "sideways" }).success).toBe(false);
    });
  });

  describe("filters", () => {
    it("accepts a fee filter", () => {
      const result = parse({ fee: "PETITION_FILING_FEE" });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ fee: "PETITION_FILING_FEE" });
    });

    it("rejects a fee key that is not on the whitelist", () => {
      expect(parse({ fee: "NOT_A_REAL_FEE" }).success).toBe(false);
    });

    it("accepts a payment method filter", () => {
      const result = parse({ paymentMethod: "ACH" });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ paymentMethod: "ACH" });
    });

    it("rejects a payment method that is not a known label", () => {
      expect(parse({ paymentMethod: "cash" }).success).toBe(false);
    });

    it("accepts a transaction status filter", () => {
      const result = parse({ transactionStatus: "processed" });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ transactionStatus: "processed" });
    });

    it("rejects a transaction status that is not a known value", () => {
      expect(parse({ transactionStatus: "cancelled" }).success).toBe(false);
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

  describe("includeFeeBreakdown", () => {
    it("stays off when it is not asked for", () => {
      expect(parse({}).data?.includeFeeBreakdown).toBe(false);
    });

    it('turns on for the string "true"', () => {
      expect(
        parse({ includeFeeBreakdown: "true" }).data?.includeFeeBreakdown,
      ).toBe(true);
    });

    it('stays off for the string "false"', () => {
      expect(
        parse({ includeFeeBreakdown: "false" }).data?.includeFeeBreakdown,
      ).toBe(false);
    });

    it("rejects a value that is neither true nor false", () => {
      expect(parse({ includeFeeBreakdown: "yes" }).success).toBe(false);
    });

    it("survives the timeframe transform", () => {
      const result = parse({
        from: FROM,
        to: TO,
        includeFeeBreakdown: "true",
      });

      expect(result.data?.includeFeeBreakdown).toBe(true);
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
    expect(result.data).not.toHaveProperty("feeBreakdown");
  });

  it("parses with a fee breakdown", () => {
    const result = TransactionLogResponseSchema.safeParse({
      ...response,
      feeBreakdown: [
        {
          fee: "NONATTORNEY_EXAM_REGISTRATION_FEE",
          feeName: "Non-Attorney Exam Registration Fee",
          qty: 3,
          subtotal: 750,
        },
        {
          fee: "PETITION_FILING_FEE",
          feeName: "Petition Filing Fee",
          qty: 2,
          subtotal: 120,
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.data?.feeBreakdown?.[0].subtotal).toBe(750);
  });

  it("rejects a breakdown row missing its tally", () => {
    const result = TransactionLogResponseSchema.safeParse({
      ...response,
      feeBreakdown: [
        { fee: "PETITION_FILING_FEE", feeName: "Petition Filing Fee" },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("parses with a total for each of the five periods", () => {
    const result = TransactionLogResponseSchema.safeParse({
      ...response,
      totals: mapCourtPeriods(() => period),
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

  // A CHECK constraint already keeps amounts non-negative. Rejecting one here
  // would turn a data anomaly into a 500 on a read-only call, so it parses and
  // the figure reaches the caller instead.
  it("passes a negative total through rather than failing the response", () => {
    const result = TransactionLogResponseSchema.safeParse({
      ...response,
      totals: {
        ...mapCourtPeriods(() => period),
        day: { ...period, total: -1 },
      },
    });

    expect(result.success).toBe(true);
    expect(result.data?.totals?.day.total).toBe(-1);
  });

  it("parses YoY trends with one comparison per period", () => {
    const result = TransactionLogResponseSchema.safeParse({
      ...response,
      yoyTrends: mapCourtPeriods(() => ({
        current: 100,
        previous: 80,
        difference: 20,
        percentChange: 25,
      })),
    });

    expect(result.success).toBe(true);
    expect(result.data?.yoyTrends?.fiscalYear.percentChange).toBe(25);
  });

  it("parses a null YoY percent change when the previous total is zero", () => {
    const result = TransactionLogResponseSchema.safeParse({
      ...response,
      yoyTrends: mapCourtPeriods(() => ({
        current: 100,
        previous: 0,
        difference: 100,
        percentChange: null,
      })),
    });

    expect(result.success).toBe(true);
    expect(result.data?.yoyTrends?.fiscalYear.percentChange).toBeNull();
  });

  it("rejects YoY trends missing a period", () => {
    const result = TransactionLogResponseSchema.safeParse({
      ...response,
      yoyTrends: {
        day: {
          current: 100,
          previous: 80,
          difference: 20,
          percentChange: 25,
        },
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
