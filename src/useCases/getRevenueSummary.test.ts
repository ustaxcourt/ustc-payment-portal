import TransactionModel from "../db/TransactionModel";
import type { AppContext } from "@appTypes/AppContext";
import { mapCourtPeriods } from "@utils/courtDayBounds";
import { getRevenueSummary } from "./getRevenueSummary";

const appContext = {
  logger: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
} as unknown as AppContext;

const PETITION = { fee: "PETITION_FILING_FEE", qty: 2, subtotal: 120 };

const stubTallies = () =>
  jest
    .spyOn(TransactionModel, "feeTalliesByPeriods")
    .mockResolvedValue(mapCourtPeriods(() => [PETITION]));

const stubPreviousTotals = () =>
  jest
    .spyOn(TransactionModel, "totalsToDate")
    .mockResolvedValue(mapCourtPeriods(() => 100));

afterEach(() => jest.restoreAllMocks());

describe("getRevenueSummary", () => {
  it("derives each period's total from its tallies", async () => {
    stubTallies();
    stubPreviousTotals();

    const result = await getRevenueSummary(appContext);

    expect(result.totals.day.total).toBe(120);
    expect(result.totals.fiscalYear.total).toBe(120);
  });

  it("zero-fills configured fees and carries the tallied ones", async () => {
    stubTallies();
    stubPreviousTotals();

    const result = await getRevenueSummary(appContext);
    const fees = result.totals.day.fees;

    expect(fees.find((row) => row.fee === "PETITION_FILING_FEE")).toMatchObject(
      { qty: 2, subtotal: 120 },
    );
    // More rows than tallied: every configured fee appears, zero-filled.
    expect(fees.length).toBeGreaterThan(1);
    expect(fees.some((row) => row.qty === 0)).toBe(true);
  });

  it("computes trends against the prior-year totals", async () => {
    stubTallies();
    stubPreviousTotals();

    const result = await getRevenueSummary(appContext);

    expect(result.yoyTrends?.day).toEqual({
      current: 120,
      previous: 100,
      difference: 20,
      percentChange: 20,
    });
  });

  it("omits the trends when the prior-year query fails, keeping the totals", async () => {
    stubTallies();
    jest
      .spyOn(TransactionModel, "totalsToDate")
      .mockRejectedValue(new Error("prior year unavailable"));

    const result = await getRevenueSummary(appContext);

    expect(result.yoyTrends).toBeUndefined();
    expect(result.totals.day.total).toBe(120);
  });

  it("echoes the summed window on every period", async () => {
    stubTallies();
    stubPreviousTotals();

    const result = await getRevenueSummary(appContext);

    for (const period of Object.values(result.totals)) {
      expect(Date.parse(period.from)).toBeLessThan(Date.parse(period.to));
    }
  });
});
