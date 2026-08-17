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

describe("TransactionModel.totalsToDate", () => {
  const NOW = new Date("2026-08-17T15:00:00.000Z");

  const WINDOWS = {
    day: { start: new Date("2026-08-17T04:00:00.000Z"), end: NOW },
    week: { start: new Date("2026-08-16T04:00:00.000Z"), end: NOW },
    month: { start: new Date("2026-08-01T04:00:00.000Z"), end: NOW },
    quarter: { start: new Date("2026-07-01T04:00:00.000Z"), end: NOW },
    fiscalYear: { start: new Date("2025-10-01T04:00:00.000Z"), end: NOW },
  };

  const SUM_SQL =
    "coalesce(sum(??) filter (where ?? >= ? and ?? < ?), 0) as ??";

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
    const chains = stubQuery([{}]);

    await TransactionModel.totalsToDate(WINDOWS);
    const [q] = chains;

    expect(q.where).toHaveBeenCalledWith("paymentStatus", "success");
  });

  it("takes a single round trip for all five windows", async () => {
    const raw = stubRaw();
    const chains = stubQuery([{}]);

    await TransactionModel.totalsToDate(WINDOWS);

    expect(chains).toHaveLength(1);
    expect(raw).toHaveBeenCalledTimes(5);
    expect(chains[0].select).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ sql: SUM_SQL })]),
    );
  });

  it("bounds each window on lastUpdatedAt, matching the log's timeframe", async () => {
    const raw = stubRaw();
    stubQuery([{}]);

    await TransactionModel.totalsToDate(WINDOWS);

    expect(raw).toHaveBeenCalledWith(SUM_SQL, [
      "transactionAmount",
      "lastUpdatedAt",
      WINDOWS.fiscalYear.start,
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

    expect(await TransactionModel.totalsToDate(WINDOWS)).toEqual({
      day: 120.5,
      week: 1200,
      month: 4800,
      quarter: 14400,
      fiscalYear: 57600,
    });
  });

  it("returns zero for a window with no successful payments", async () => {
    stubRaw();
    stubQuery([{ day: null, week: "0", month: "0", quarter: "0" }]);

    expect(await TransactionModel.totalsToDate(WINDOWS)).toMatchObject({
      day: 0,
      week: 0,
      fiscalYear: 0,
    });
  });

  it("returns zero for every window when no row comes back", async () => {
    stubRaw();
    stubQuery([]);

    expect(await TransactionModel.totalsToDate(WINDOWS)).toEqual({
      day: 0,
      week: 0,
      month: 0,
      quarter: 0,
      fiscalYear: 0,
    });
  });
});
