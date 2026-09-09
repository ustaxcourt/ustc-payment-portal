import { isLocal } from "../../config/appEnv";
import type { RevenueSummaryResponse } from "@schemas/RevenueSummary.schema";
import { signedFetch } from "./sigv4Helper";

/**
 * The revenue summary against a real database. The aggregate is raw SQL with
 * per-period FILTER clauses, so a renamed column or unsupported clause
 * surfaces here even against an empty database. Amounts are asserted as
 * relationships rather than figures, since the local database holds whatever
 * previous runs left behind.
 */

const PERIODS = ["day", "week", "month", "quarter", "fiscalYear"] as const;

describe("GET /revenue-summary", () => {
  jest.setTimeout(60_000);
  let baseUrl: string;

  beforeAll(() => {
    baseUrl = process.env.BASE_URL ?? "";
    if (!baseUrl) {
      throw new Error("BASE_URL is required for revenue summary tests");
    }
  });

  const portalFetch = (url: string): Promise<Response> =>
    isLocal() ? fetch(url) : signedFetch(url, {});

  const fetchSummary = async (): Promise<RevenueSummaryResponse> => {
    const response = await portalFetch(`${baseUrl}/revenue-summary`);
    expect(response.status).toBe(200);
    return response.json();
  };

  it("returns every period with a total and its fee tallies", async () => {
    const { totals } = await fetchSummary();

    for (const period of PERIODS) {
      expect(totals[period].total).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(totals[period].fees)).toBe(true);
      // Configured fees appear even at zero, so the list is never empty.
      expect(totals[period].fees.length).toBeGreaterThan(0);
    }
  });

  it("keeps each period's total equal to its summed fees", async () => {
    // The single-statement guarantee this endpoint exists to provide.
    const { totals } = await fetchSummary();

    for (const period of PERIODS) {
      const summed = totals[period].fees.reduce(
        (running, row) => running + row.subtotal,
        0,
      );
      expect(totals[period].total).toBeCloseTo(summed, 2);
    }
  });

  it("returns each period as a half-open range ending now", async () => {
    const requestedAt = Date.now();
    const { totals } = await fetchSummary();

    for (const period of PERIODS) {
      const { from, to } = totals[period];

      expect(new Date(from).getTime()).toBeLessThan(new Date(to).getTime());
      expect(new Date(to).getTime()).toBeGreaterThanOrEqual(
        requestedAt - 60_000,
      );
      expect(new Date(to).getTime()).toBeLessThanOrEqual(Date.now() + 60_000);
    }
  });

  it("nests each period inside the next one out", async () => {
    const { totals } = await fetchSummary();

    // The week can open in the previous month, so it is left out of the chain.
    const opens = (period: (typeof PERIODS)[number]) =>
      new Date(totals[period].from).getTime();

    expect(opens("day")).toBeGreaterThanOrEqual(opens("week"));
    expect(opens("day")).toBeGreaterThanOrEqual(opens("month"));
    expect(opens("month")).toBeGreaterThanOrEqual(opens("quarter"));
    expect(opens("quarter")).toBeGreaterThanOrEqual(opens("fiscalYear"));

    expect(totals.day.total).toBeLessThanOrEqual(totals.month.total);
    expect(totals.month.total).toBeLessThanOrEqual(totals.quarter.total);
    expect(totals.quarter.total).toBeLessThanOrEqual(totals.fiscalYear.total);
  });

  it("orders each period's fees by subtotal descending", async () => {
    const { totals } = await fetchSummary();

    for (const period of PERIODS) {
      const subtotals = totals[period].fees.map((row) => row.subtotal);
      expect(subtotals).toEqual([...subtotals].sort((a, b) => b - a));
    }
  });

  it("agrees with itself across totals and trends", async () => {
    const summary = await fetchSummary();
    if (!summary.yoyTrends) return; // Trends may degrade; totals must not.

    for (const period of PERIODS) {
      expect(summary.yoyTrends[period].current).toBeCloseTo(
        summary.totals[period].total,
        2,
      );
    }
  });

  it("rejects any query parameter", async () => {
    const response = await portalFetch(
      `${baseUrl}/revenue-summary?includeAnything=true`,
    );

    expect(response.status).toBe(400);
  });
});
