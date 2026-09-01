import TransactionModel from "./TransactionModel";
import { getKnex } from "./knex";

jest.mock("./knex", () => ({ getKnex: jest.fn() }));

const FROM = new Date("2026-08-03T04:00:00.000Z");
const TO = new Date("2026-08-04T04:00:00.000Z");

const METHODS = [
  "where",
  "andWhere",
  "orderBy",
  "orderByRaw",
  "limit",
  "offset",
  "select",
  "count",
  "sum",
  "groupBy",
];

const stubQuery = (rows: unknown[], total = 0) => {
  const chains: any[] = [];

  jest.spyOn(TransactionModel, "query").mockImplementation(((): any => {
    const chain: any = Promise.resolve(rows);
    for (const m of METHODS) chain[m] = jest.fn(() => chain);
    chain.resultSize = jest.fn(() => Promise.resolve(total));
    chains.push(chain);
    return chain;
  }) as any);

  return chains;
};

const page = {
  from: FROM,
  to: TO,
  limit: 50,
  offset: 0,
  sort: "lastUpdatedAt",
  order: "desc",
} as const;

afterEach(() => jest.restoreAllMocks());

describe("TransactionModel.queryLog", () => {
  it("bounds and orders on lastUpdatedAt, and pages with limit/offset", async () => {
    const chains = stubQuery([], 90);

    const result = await TransactionModel.queryLog({
      ...page,
      limit: 25,
      offset: 50,
    });
    const [q] = chains;

    expect(q.where).toHaveBeenCalledWith("lastUpdatedAt", ">=", FROM);
    expect(q.andWhere).toHaveBeenCalledWith("lastUpdatedAt", "<", TO);
    expect(q.orderByRaw).toHaveBeenCalledWith("?? desc nulls last", [
      "lastUpdatedAt",
    ]);
    expect(q.limit).toHaveBeenCalledWith(25);
    expect(q.offset).toHaveBeenCalledWith(50);
    expect(result.total).toBe(90);
  });

  it("breaks ties on the primary key so the order is total", async () => {
    const chains = stubQuery([], 3);

    await TransactionModel.queryLog(page);
    const [q] = chains;

    expect(q.orderBy).toHaveBeenCalledWith("agencyTrackingId", "asc");
  });

  it("orders by the requested column and direction", async () => {
    const chains = stubQuery([], 3);

    await TransactionModel.queryLog({
      ...page,
      sort: "clientName",
      order: "asc",
    });
    const [q] = chains;

    expect(q.orderByRaw).toHaveBeenCalledWith("?? asc nulls last", [
      "clientName",
    ]);
  });

  it("counts without ordering or paging the count query", async () => {
    const chains = stubQuery([], 7);

    await TransactionModel.queryLog(page);
    const [, countQuery] = chains;

    expect(countQuery.orderByRaw).not.toHaveBeenCalled();
    expect(countQuery.limit).not.toHaveBeenCalled();
  });

  it("skips the COUNT query entirely when withTotal is false", async () => {
    const chains = stubQuery([], 7);

    const result = await TransactionModel.queryLog({
      ...page,
      withTotal: false,
    });

    // Only the page query runs; no second chain is ever built for the count.
    expect(chains).toHaveLength(1);
    expect(chains[0].resultSize).not.toHaveBeenCalled();
    expect(result.total).toBeUndefined();
    expect(result.rows).toEqual([]);
  });

  it("still counts when withTotal is explicitly true", async () => {
    const chains = stubQuery([], 12);

    const result = await TransactionModel.queryLog({
      ...page,
      withTotal: true,
    });

    expect(chains).toHaveLength(2);
    expect(result.total).toBe(12);
  });

  it("applies a requested status to both the page and its count", async () => {
    const chains = stubQuery([], 4);

    await TransactionModel.queryLog({ ...page, status: "failed" });

    expect(chains).toHaveLength(2);
    for (const q of chains) {
      expect(q.andWhere).toHaveBeenCalledWith("paymentStatus", "failed");
    }
  });

  it("omits the status filter when none is requested", async () => {
    const chains = stubQuery([], 1);

    await TransactionModel.queryLog(page);

    for (const q of chains) {
      expect(q.andWhere).not.toHaveBeenCalledWith(
        "paymentStatus",
        expect.anything(),
      );
    }
  });
});

describe("TransactionModel.countsInRange", () => {
  it("never narrows by status, so the tallies survive filtering", async () => {
    const chains = stubQuery([{ paymentStatus: "failed", count: "3" }]);

    await TransactionModel.countsInRange(FROM, TO);
    const [q] = chains;

    expect(q.where).toHaveBeenCalledWith("lastUpdatedAt", ">=", FROM);
    expect(q.groupBy).toHaveBeenCalledWith("paymentStatus");
    expect(q.where).not.toHaveBeenCalledWith(
      "paymentStatus",
      expect.anything(),
    );
    expect(q.andWhere).not.toHaveBeenCalledWith(
      "paymentStatus",
      expect.anything(),
    );
  });

  it("returns zero for statuses absent from the result set", async () => {
    stubQuery([
      { paymentStatus: "success", count: "6" },
      { paymentStatus: "failed", count: "3" },
    ]);

    expect(await TransactionModel.countsInRange(FROM, TO)).toEqual({
      success: 6,
      failed: 3,
      pending: 0,
      total: 9,
    });
  });
});

describe("TransactionModel.countsAndFeeBreakdownInRange", () => {
  const grouped = [
    { paymentStatus: "success", fee: "PETITION_FILING_FEE", qty: "2", subtotal: "120.50" },
    { paymentStatus: "success", fee: "NONATTORNEY_EXAM_REGISTRATION_FEE", qty: "1", subtotal: "250.00" },
    { paymentStatus: "failed", fee: "PETITION_FILING_FEE", qty: "3", subtotal: "180.00" },
    { paymentStatus: "pending", fee: "PETITION_FILING_FEE", qty: "1", subtotal: "60.00" },
  ];

  it("reads one statement, bounded on lastUpdatedAt with no status filter", async () => {
    const chains = stubQuery([]);

    await TransactionModel.countsAndFeeBreakdownInRange(FROM, TO);

    expect(chains).toHaveLength(1);
    const [q] = chains;
    expect(q.where).toHaveBeenCalledWith("lastUpdatedAt", ">=", FROM);
    expect(q.andWhere).toHaveBeenCalledWith("lastUpdatedAt", "<", TO);
    expect(q.where).not.toHaveBeenCalledWith("paymentStatus", expect.anything());
    expect(q.groupBy).toHaveBeenCalledWith("paymentStatus", "fee");
    expect(q.count).toHaveBeenCalledWith("* as qty");
    expect(q.sum).toHaveBeenCalledWith("transactionAmount as subtotal");
  });

  it("derives both aggregates from the same rows, so they cannot disagree", async () => {
    stubQuery(grouped);

    const { counts, tallies } = await TransactionModel.countsAndFeeBreakdownInRange(FROM, TO);

    expect(counts).toEqual({ success: 3, failed: 3, pending: 1, total: 7 });
    expect(tallies).toEqual([
      { fee: "PETITION_FILING_FEE", qty: 2, subtotal: 120.5 },
      { fee: "NONATTORNEY_EXAM_REGISTRATION_FEE", qty: 1, subtotal: 250 },
    ]);
    expect(counts.success).toBe(tallies.reduce((sum, tally) => sum + tally.qty, 0));
  });

  it("returns zero counts and no tallies for an empty timeframe", async () => {
    stubQuery([]);

    expect(await TransactionModel.countsAndFeeBreakdownInRange(FROM, TO)).toEqual({
      counts: { success: 0, failed: 0, pending: 0, total: 0 },
      tallies: [],
    });
  });

  it("throws rather than reporting a silent $0 for a fee", async () => {
    stubQuery([
      { paymentStatus: "success", fee: "PETITION_FILING_FEE", qty: "2", subtotal: null },
    ]);

    await expect(
      TransactionModel.countsAndFeeBreakdownInRange(FROM, TO),
    ).rejects.toThrow('no usable tally for the "PETITION_FILING_FEE" fee');
  });

  it("tolerates a bad subtotal on a group the breakdown discards", async () => {
    stubQuery([
      { paymentStatus: "failed", fee: "PETITION_FILING_FEE", qty: "3", subtotal: null },
    ]);

    const { counts, tallies } = await TransactionModel.countsAndFeeBreakdownInRange(FROM, TO);

    expect(counts).toEqual({ success: 0, failed: 3, pending: 0, total: 3 });
    expect(tallies).toEqual([]);
  });
});

describe("TransactionModel.totalsToDate", () => {
  const NOW = new Date("2026-08-17T15:00:00.000Z");

  const PERIODS = {
    day: { start: new Date("2026-08-17T04:00:00.000Z"), end: NOW },
    week: { start: new Date("2026-08-16T04:00:00.000Z"), end: NOW },
    month: { start: new Date("2026-08-01T04:00:00.000Z"), end: NOW },
    quarter: { start: new Date("2026-07-01T04:00:00.000Z"), end: NOW },
    fiscalYear: { start: new Date("2025-10-01T04:00:00.000Z"), end: NOW },
  };

  const SUM_SQL =
    "coalesce(sum(??) filter (where ?? >= ? and ?? < ?), 0) as ??";

  // What COALESCE guarantees for an empty table: a value for every period.
  const ZERO_ROW = {
    day: "0",
    week: "0",
    month: "0",
    quarter: "0",
    fiscalYear: "0",
  };

  const stubRaw = () => {
    const raw = jest.fn((sql: string, bindings: unknown[]) => ({
      sql,
      bindings,
    }));
    (getKnex as jest.Mock).mockResolvedValue({ raw });
    return raw;
  };

  it("sums successful payments only", async () => {
    stubRaw();
    const chains = stubQuery([ZERO_ROW]);

    await TransactionModel.totalsToDate(PERIODS);
    const [q] = chains;

    expect(q.where).toHaveBeenCalledWith("paymentStatus", "success");
  });

  describe("outer range", () => {
    // FILTER is evaluated per row, so the scan needs bounding to stay off
    // every successful row ever written.
    it("brackets the scan with the widest period", async () => {
      stubRaw();
      const chains = stubQuery([ZERO_ROW]);

      await TransactionModel.totalsToDate(PERIODS);
      const [q] = chains;

      expect(q.andWhere).toHaveBeenCalledWith(
        "lastUpdatedAt",
        ">=",
        PERIODS.fiscalYear.start,
      );
      expect(q.andWhere).toHaveBeenCalledWith("lastUpdatedAt", "<", NOW);
    });

    // In the first week of October the week opens in September, before the
    // fiscal year does. Bounding on the fiscal year would silently drop those
    // days from the week's total.
    it("opens at the earliest period, even when that is not the fiscal year", async () => {
      const openedAt = new Date("2026-10-01T15:00:00.000Z");
      const firstWeekOfFiscalYear = {
        day: { start: new Date("2026-10-01T04:00:00.000Z"), end: openedAt },
        week: { start: new Date("2026-09-27T04:00:00.000Z"), end: openedAt },
        month: { start: new Date("2026-10-01T04:00:00.000Z"), end: openedAt },
        quarter: { start: new Date("2026-10-01T04:00:00.000Z"), end: openedAt },
        fiscalYear: {
          start: new Date("2026-10-01T04:00:00.000Z"),
          end: openedAt,
        },
      };

      stubRaw();
      const chains = stubQuery([ZERO_ROW]);

      await TransactionModel.totalsToDate(firstWeekOfFiscalYear);
      const [q] = chains;

      expect(q.andWhere).toHaveBeenCalledWith(
        "lastUpdatedAt",
        ">=",
        firstWeekOfFiscalYear.week.start,
      );
      expect(q.andWhere).not.toHaveBeenCalledWith(
        "lastUpdatedAt",
        ">=",
        firstWeekOfFiscalYear.fiscalYear.start,
      );
    });
  });

  it("takes a single round trip for all five periods", async () => {
    const raw = stubRaw();
    const chains = stubQuery([ZERO_ROW]);

    await TransactionModel.totalsToDate(PERIODS);

    expect(chains).toHaveLength(1);
    expect(raw).toHaveBeenCalledTimes(5);
    expect(chains[0].select).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ sql: SUM_SQL })]),
    );
  });

  it("bounds each period on lastUpdatedAt, matching the log's timeframe", async () => {
    const raw = stubRaw();
    stubQuery([ZERO_ROW]);

    await TransactionModel.totalsToDate(PERIODS);

    expect(raw).toHaveBeenCalledWith(SUM_SQL, [
      "transactionAmount",
      "lastUpdatedAt",
      PERIODS.fiscalYear.start,
      "lastUpdatedAt",
      NOW,
      "fiscalYear",
    ]);
  });

  it("returns numbers, not the strings pg sends back for decimals", async () => {
    stubRaw();
    stubQuery([
      {
        day: "120.50",
        week: "1200.00",
        month: "4800.00",
        quarter: "14400.00",
        fiscalYear: "57600.00",
      },
    ]);

    expect(await TransactionModel.totalsToDate(PERIODS)).toEqual({
      day: 120.5,
      week: 1200,
      month: 4800,
      quarter: 14400,
      fiscalYear: 57600,
    });
  });

  it("returns zero for a period with no successful payments", async () => {
    stubRaw();
    stubQuery([
      { day: "0", week: "0", month: "0", quarter: "0", fiscalYear: "0" },
    ]);

    expect(await TransactionModel.totalsToDate(PERIODS)).toEqual({
      day: 0,
      week: 0,
      month: 0,
      quarter: 0,
      fiscalYear: 0,
    });
  });

  // COALESCE guarantees a value per period, so anything missing means the
  // alias did not survive the snake_case round trip — the one link the stubs
  // here cannot exercise. Reporting $0 revenue for that would be worse than
  // failing.
  describe("rather than reporting a silent $0", () => {
    it("throws when a period's alias does not come back", async () => {
      stubRaw();
      stubQuery([{ day: "120.50", week: "0", month: "0", quarter: "0" }]);

      await expect(TransactionModel.totalsToDate(PERIODS)).rejects.toThrow(
        'no usable total for the "fiscalYear" period',
      );
    });

    it("throws when a period comes back null", async () => {
      stubRaw();
      stubQuery([
        { day: null, week: "0", month: "0", quarter: "0", fiscalYear: "0" },
      ]);

      await expect(TransactionModel.totalsToDate(PERIODS)).rejects.toThrow(
        'no usable total for the "day" period',
      );
    });

    it("throws when no row comes back at all", async () => {
      stubRaw();
      stubQuery([]);

      await expect(TransactionModel.totalsToDate(PERIODS)).rejects.toThrow(
        "no usable total",
      );
    });
  });
});
