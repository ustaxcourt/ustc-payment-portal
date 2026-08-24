import TransactionModel from "../db/TransactionModel";
import { testAppContext as appContext } from "../test/testAppContext";
import { getTransactionLog } from "./getTransactionLog";
import type { TransactionLogQuery } from "@appTypes/TransactionLog";
import {
  TRANSACTION_LOG_DEFAULT_ORDER,
  TRANSACTION_LOG_DEFAULT_SORT,
} from "@schemas/TransactionLog.schema";

const createdAt = new Date("2026-08-03T12:00:00.000Z");
const lastUpdatedAt = new Date("2026-08-03T13:00:00.000Z");

const failedRow = {
  agencyTrackingId: "agency-1",
  paygovTrackingId: "paygov-1",
  feeName: "Filing Fee",
  fee: "PETITION_FILING_FEE",
  transactionAmount: 60,
  clientName: "payment-portal",
  transactionReferenceId: "ref-1",
  paymentStatus: "failed",
  transactionStatus: "processed",
  paymentMethod: "plastic_card",
  returnCode: 102,
  returnDetail: "Insufficient funds",
  createdAt,
  lastUpdatedAt,
};

const counts = { success: 40, failed: 4, pending: 3, total: 47 };

// Mirrors what the schema hands the use case, defaults already applied.
const query = (overrides: Partial<TransactionLogQuery> = {}) =>
  ({
    page: 1,
    pageSize: 50,
    sort: TRANSACTION_LOG_DEFAULT_SORT,
    order: TRANSACTION_LOG_DEFAULT_ORDER,
    ...overrides,
  }) as TransactionLogQuery;

const totals = {
  day: 120,
  week: 1200,
  month: 4800,
  quarter: 14400,
  fiscalYear: 57600,
};

describe("getTransactionLog", () => {
  let queryLog: jest.SpyInstance;
  let countsInRange: jest.SpyInstance;
  let totalsToDate: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-03T15:00:00.000Z"));
    queryLog = jest
      .spyOn(TransactionModel, "queryLog")
      .mockResolvedValue({ rows: [failedRow as any], total: 4 });
    countsInRange = jest
      .spyOn(TransactionModel, "countsInRange")
      .mockResolvedValue(counts);
    totalsToDate = jest
      .spyOn(TransactionModel, "totalsToDate")
      .mockResolvedValue(totals);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("defaults the timeframe to the current Court day", async () => {
    const result = await getTransactionLog(appContext, query());

    expect(result.from).toBe("2026-08-03T04:00:00.000Z");
    expect(result.to).toBe("2026-08-04T04:00:00.000Z");
    expect(queryLog.mock.calls[0][0]).toMatchObject({
      from: new Date("2026-08-03T04:00:00.000Z"),
      to: new Date("2026-08-04T04:00:00.000Z"),
    });
  });

  it("honours an explicit timeframe", async () => {
    const from = new Date("2026-07-01T00:00:00.000Z");
    const to = new Date("2026-07-02T00:00:00.000Z");

    const result = await getTransactionLog(appContext, query({ from, to }));

    expect(result.from).toBe(from.toISOString());
    expect(result.to).toBe(to.toISOString());
  });

  it("counts the whole timeframe even when a status filter is applied", async () => {
    const result = await getTransactionLog(appContext, query({ status: "failed" }));

    expect(queryLog.mock.calls[0][0]).toMatchObject({ status: "failed" });
    // countsInRange takes only the bounds, so the tallies cannot be narrowed.
    expect(countsInRange).toHaveBeenCalledWith(
      new Date("2026-08-03T04:00:00.000Z"),
      new Date("2026-08-04T04:00:00.000Z"),
    );
    expect(result.counts).toEqual({
      all: 47,
      success: 40,
      failed: 4,
      pending: 3,
    });
    expect(result.total).toBe(4);
  });

  it("translates page and pageSize into limit and offset", async () => {
    await getTransactionLog(appContext, query({ page: 3, pageSize: 25 }));

    expect(queryLog.mock.calls[0][0]).toMatchObject({ limit: 25, offset: 50 });
  });

  it("passes the requested sort down and echoes it back", async () => {
    const result = await getTransactionLog(
      appContext,
      query({ sort: "clientName", order: "asc" }),
    );

    expect(queryLog.mock.calls[0][0]).toMatchObject({
      sort: "clientName",
      order: "asc",
    });
    expect(result).toMatchObject({ sort: "clientName", order: "asc" });
  });

  it("defaults to the newest activity first", async () => {
    const result = await getTransactionLog(appContext, query());

    expect(result).toMatchObject({ sort: "lastUpdatedAt", order: "desc" });
  });

  it("applies default sort/order when they are absent", async () => {
    const result = await getTransactionLog(
      appContext,
      query({ sort: undefined, order: undefined }),
    );

    expect(queryLog.mock.calls[0][0]).toMatchObject({
      sort: TRANSACTION_LOG_DEFAULT_SORT,
      order: TRANSACTION_LOG_DEFAULT_ORDER,
    });
    expect(result).toMatchObject({
      sort: TRANSACTION_LOG_DEFAULT_SORT,
      order: TRANSACTION_LOG_DEFAULT_ORDER,
    });
  });

  it("returns the failure reason and the display payment method", async () => {
    const result = await getTransactionLog(appContext, query());

    expect(result.data[0].returnCode).toBe(102);
    expect(result.data[0].returnDetail).toBe("Insufficient funds");
    expect(result.data[0].paymentMethod).toBe("Credit/Debit Card");
  });

  describe("filters", () => {
    it("passes fee straight through and translates the payment method label to the stored value", async () => {
      await getTransactionLog(
        appContext,
        query({ fee: "PETITION_FILING_FEE", paymentMethod: "ACH" }),
      );

      expect(queryLog.mock.calls[0][0]).toMatchObject({
        fee: "PETITION_FILING_FEE",
        paymentMethod: "ach",
      });
    });

    it("passes transactionStatus and clientName straight through", async () => {
      await getTransactionLog(
        appContext,
        query({ transactionStatus: "processed", clientName: "payment" }),
      );

      expect(queryLog.mock.calls[0][0]).toMatchObject({
        transactionStatus: "processed",
        clientName: "payment",
      });
    });
  });

  describe("export requests", () => {
    it("computes the totals on the first page", async () => {
      const result = await getTransactionLog(
        appContext,
        query({ export: true, page: 1, pageSize: 5000 }),
      );

      expect(queryLog.mock.calls[0][0]).toMatchObject({ withTotal: true });
      expect(countsInRange).toHaveBeenCalled();
      expect(result.total).toBe(4);
      expect(result.counts).toBeDefined();
    });

    it("skips both COUNT queries on pages after the first", async () => {
      queryLog.mockResolvedValue({ rows: [failedRow as any] });

      const result = await getTransactionLog(
        appContext,
        query({ export: true, page: 2, pageSize: 5000 }),
      );

      expect(queryLog.mock.calls[0][0]).toMatchObject({
        withTotal: false,
        limit: 5000,
        offset: 5000,
      });
      expect(countsInRange).not.toHaveBeenCalled();
      expect(result.total).toBeUndefined();
      expect(result.counts).toBeUndefined();
    });

    it("keeps the totals on every page of a non-export request", async () => {
      await getTransactionLog(appContext, query({ export: false, page: 2 }));

      expect(queryLog.mock.calls[0][0]).toMatchObject({ withTotal: true });
      expect(countsInRange).toHaveBeenCalled();
    });

    // Each page would close its periods at a different `now`, so an export
    // would carry a different set of figures on every page.
    it("skips the period totals on pages after the first", async () => {
      queryLog.mockResolvedValue({ rows: [failedRow as any] });

      const result = await getTransactionLog(
        appContext,
        query({ export: true, page: 2, includeTotals: true }),
      );

      expect(totalsToDate).not.toHaveBeenCalled();
      expect(result.totals).toBeUndefined();
    });

    it("returns the period totals on the first page", async () => {
      const result = await getTransactionLog(
        appContext,
        query({ export: true, page: 1, includeTotals: true }),
      );

      expect(result.totals?.day.total).toBe(120);
    });
  });

  describe("totals", () => {
    it("leaves them out — and does not query them — unless asked", async () => {
      const result = await getTransactionLog(appContext, query());

      expect(totalsToDate).not.toHaveBeenCalled();
      expect(result).not.toHaveProperty("totals");
    });

    it("returns a total per period when asked", async () => {
      const result = await getTransactionLog(
        appContext,
        query({ includeTotals: true }),
      );

      expect(totalsToDate).toHaveBeenCalledTimes(1);
      expect(result.totals?.day.total).toBe(120);
      expect(result.totals?.fiscalYear.total).toBe(57600);
    });

    it("echoes the period each total was summed over", async () => {
      const result = await getTransactionLog(
        appContext,
        query({ includeTotals: true }),
      );

      expect(result.totals?.day).toMatchObject({
        from: "2026-08-03T04:00:00.000Z",
        to: "2026-08-03T15:00:00.000Z",
      });
      expect(result.totals?.fiscalYear.from).toBe("2025-10-01T04:00:00.000Z");
      expect(totalsToDate.mock.calls[0][0].fiscalYear.start).toEqual(
        new Date("2025-10-01T04:00:00.000Z"),
      );
    });

    // Both derive from a single clock read, so they always name the same Court
    // day. Fake timers freeze the clock here, so this pins the relationship
    // rather than reproducing the midnight race it protects against.
    it("opens the day period on the same instant as the default timeframe", async () => {
      const result = await getTransactionLog(
        appContext,
        query({ includeTotals: true }),
      );

      expect(result.totals?.day.from).toBe(result.from);
    });

    it("ignores the requested timeframe and status", async () => {
      const result = await getTransactionLog(
        appContext,
        query({
          from: new Date("2026-07-01T00:00:00.000Z"),
          to: new Date("2026-07-02T00:00:00.000Z"),
          status: "failed",
          includeTotals: true,
        }),
      );

      expect(totalsToDate.mock.calls[0][0].day.start).toEqual(
        new Date("2026-08-03T04:00:00.000Z"),
      );
      expect(result.totals?.day.total).toBe(120);
    });
  });
});
