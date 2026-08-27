import { isLocal } from "../../config/appEnv";
import type { TransactionLogResponse } from "@appTypes/TransactionLog";
import { signedFetch } from "./sigv4Helper";

/**
 * Totals against a real database. The aggregate is raw SQL, so a renamed column
 * or an unsupported FILTER clause surfaces here even against an empty database.
 * Amounts are asserted as relationships between the periods rather than as
 * figures, since the local database holds whatever previous runs left behind.
 */

// Wide enough to pick up whatever the local database happens to hold.
const FROM = "2020-01-01T00:00:00Z";
const TO = "2030-01-01T00:00:00Z";

const PERIODS = ["day", "week", "month", "quarter", "fiscalYear"] as const;

describe("GET /transaction-log totals", () => {
  jest.setTimeout(60_000);
  let baseUrl: string;

  beforeAll(() => {
    baseUrl = process.env.BASE_URL ?? "";
    if (!baseUrl) {
      throw new Error("BASE_URL is required for transaction log totals tests");
    }
  });

  const portalFetch = (url: string): Promise<Response> =>
    isLocal() ? fetch(url) : signedFetch(url, {});

  const logUrl = (params: Record<string, string> = {}): string => {
    const search = new URLSearchParams({ from: FROM, to: TO, ...params });
    return `${baseUrl}/transaction-log?${search}`;
  };

  const fetchLog = async (
    params: Record<string, string> = {},
  ): Promise<TransactionLogResponse> => {
    const response = await portalFetch(logUrl(params));
    expect(response.status).toBe(200);
    return response.json();
  };

  type Totals = NonNullable<TransactionLogResponse["totals"]>;

  const fetchTotals = async (): Promise<Totals> => {
    const body = await fetchLog({ includeTotals: "true" });
    if (!body.totals) {
      throw new Error("includeTotals=true returned no totals");
    }
    return body.totals;
  };

  it("omits totals unless they are asked for", async () => {
    const body = await fetchLog();

    expect(body).not.toHaveProperty("totals");
  });

  it("omits totals when they are explicitly opted out of", async () => {
    const body = await fetchLog({ includeTotals: "false" });

    expect(body).not.toHaveProperty("totals");
  });

  it("returns a total for each of the five periods", async () => {
    const totals = await fetchTotals();

    for (const period of PERIODS) {
      expect(totals[period].total).toBeGreaterThanOrEqual(0);
    }
  });

  it("returns each period as a half-open range ending now", async () => {
    const requestedAt = Date.now();
    const totals = await fetchTotals();

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
    const totals = await fetchTotals();

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

  it("counts successful payments only", async () => {
    const { fiscalYear } = await fetchTotals();

    // counts ignores the status filter, so this is every status in the period.
    const inPeriod = await fetchLog({
      from: fiscalYear.from,
      to: fiscalYear.to,
      pageSize: "1",
    });

    // Present on a non-export first page; guarded so a contract change surfaces
    // here rather than silently skipping the assertion.
    expect(inPeriod.counts).toBeDefined();

    // No successes means no revenue, however many failed or pending rows exist.
    if (inPeriod.counts?.success === 0) {
      expect(fiscalYear.total).toBe(0);
    }
  });

  it("agrees with the rows themselves over a period that fits in one page", async () => {
    const { day } = await fetchTotals();

    const successes = await fetchLog({
      from: day.from,
      to: day.to,
      status: "success",
      pageSize: "200",
    });

    expect(successes.total).toBeDefined();

    // Above one page the client cannot check the figure — the reason the sum
    // happens in Postgres at all.
    if ((successes.total ?? 0) > successes.data.length) return;

    const summed = successes.data.reduce(
      (running, row) => running + row.transactionAmount,
      0,
    );

    expect(day.total).toBeCloseTo(summed, 2);
  });

  it("holds the figures steady while the log is filtered", async () => {
    const unfiltered = await fetchLog({ includeTotals: "true" });
    const filtered = await fetchLog({
      includeTotals: "true",
      status: "failed",
      from: "2026-01-01T00:00:00Z",
      to: "2026-01-02T00:00:00Z",
    });

    for (const period of PERIODS) {
      expect(filtered.totals?.[period].total).toBe(
        unfiltered.totals?.[period].total,
      );
    }
  });

  it("rejects a value that is neither true nor false", async () => {
    const response = await portalFetch(logUrl({ includeTotals: "yes" }));

    expect(response.status).toBe(400);
  });

  describe("prior-year totals", () => {
    type PriorYearTotals = NonNullable<
      TransactionLogResponse["priorYearTotals"]
    >;

    const fetchPriorYearTotals = async (): Promise<PriorYearTotals> => {
      const body = await fetchLog({ includePriorYearTotals: "true" });
      if (!body.priorYearTotals) {
        throw new Error(
          "includePriorYearTotals=true returned no priorYearTotals",
        );
      }
      return body.priorYearTotals;
    };

    it("omits them unless they are asked for", async () => {
      const body = await fetchLog({ includeTotals: "true" });

      expect(body).not.toHaveProperty("priorYearTotals");
    });

    it("returns each period about a Court year back, closed and flagged", async () => {
      const yearMs = 366 * 24 * 3_600_000;
      const requestedAt = Date.now();
      const totals = await fetchPriorYearTotals();

      for (const period of PERIODS) {
        const { from, to, total, hasData } = totals[period];

        expect(new Date(from).getTime()).toBeLessThan(new Date(to).getTime());
        // `to` is the corresponding instant last year, so it sits within a
        // leap year of the request, give or take the request's own latency.
        expect(new Date(to).getTime()).toBeGreaterThanOrEqual(
          requestedAt - yearMs - 60_000,
        );
        expect(new Date(to).getTime()).toBeLessThanOrEqual(
          requestedAt - yearMs + 3 * 24 * 3_600_000,
        );
        expect(total).toBeGreaterThanOrEqual(0);
        expect(typeof hasData).toBe("boolean");
      }
    });

    it("rejects a value that is neither true nor false", async () => {
      const response = await portalFetch(
        logUrl({ includePriorYearTotals: "yes" }),
      );

      expect(response.status).toBe(400);
    });
  });
});
