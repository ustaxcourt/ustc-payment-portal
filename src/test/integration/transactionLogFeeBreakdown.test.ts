import { isLocal } from "../../config/appEnv";
import type { TransactionLogResponse } from "@appTypes/TransactionLog";
import { signedFetch } from "./sigv4Helper";

/**
 * Fee breakdown against a real database. The aggregate is grouped SQL, so a
 * renamed column or an alias lost to the case mapper surfaces here. Figures
 * are asserted as relationships against the same endpoint's rows and counts,
 * since the local database holds whatever previous runs left behind.
 */

// Wide enough to pick up whatever the local database happens to hold.
const FROM = "2020-01-01T00:00:00Z";
const TO = "2030-01-01T00:00:00Z";

const CONFIGURED_FEES = [
  "PETITION_FILING_FEE",
  "NONATTORNEY_EXAM_REGISTRATION_FEE",
] as const;

describe("GET /transaction-log fee breakdown", () => {
  jest.setTimeout(60_000);
  let baseUrl: string;

  beforeAll(() => {
    baseUrl = process.env.BASE_URL ?? "";
    if (!baseUrl) {
      throw new Error(
        "BASE_URL is required for transaction log fee breakdown tests",
      );
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

  type FeeBreakdown = NonNullable<TransactionLogResponse["feeBreakdown"]>;

  const fetchBreakdown = async (
    params: Record<string, string> = {},
  ): Promise<TransactionLogResponse & { feeBreakdown: FeeBreakdown }> => {
    const body = await fetchLog({
      includeFeeBreakdown: "true",
      pageSize: "1",
      ...params,
    });
    if (!body.feeBreakdown) {
      throw new Error("includeFeeBreakdown=true returned no feeBreakdown");
    }
    return body as TransactionLogResponse & { feeBreakdown: FeeBreakdown };
  };

  it("omits the breakdown unless it is asked for", async () => {
    const body = await fetchLog();

    expect(body).not.toHaveProperty("feeBreakdown");
  });

  it("omits the breakdown when it is explicitly opted out of", async () => {
    const body = await fetchLog({ includeFeeBreakdown: "false" });

    expect(body).not.toHaveProperty("feeBreakdown");
  });

  it("returns a row for every configured fee, tallied with usable numbers", async () => {
    const { feeBreakdown } = await fetchBreakdown();

    for (const fee of CONFIGURED_FEES) {
      const row = feeBreakdown.find((candidate) => candidate.fee === fee);

      expect(row).toBeDefined();
      expect(row?.feeName).not.toBe("");
      expect(Number.isInteger(row?.qty)).toBe(true);
      expect(row?.qty).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(row?.subtotal)).toBe(true);
    }
  });

  it("orders the rows by subtotal descending", async () => {
    const { feeBreakdown } = await fetchBreakdown();

    const subtotals = feeBreakdown.map((row) => row.subtotal);
    expect(subtotals).toEqual([...subtotals].sort((a, b) => b - a));
  });

  // counts.success is the same population — successful rows in the timeframe —
  // so the two figures must agree at any volume.
  it("agrees with the status counts on how many payments succeeded", async () => {
    const body = await fetchBreakdown();

    expect(body.counts).toBeDefined();
    const tallied = body.feeBreakdown.reduce((sum, row) => sum + row.qty, 0);
    expect(tallied).toBe(body.counts?.success);
  });

  it("agrees with the rows themselves over a timeframe that fits in one page", async () => {
    const successes = await fetchLog({ status: "success", pageSize: "200" });

    expect(successes.total).toBeDefined();
    // Above one page the client cannot check the figures — the reason the
    // aggregation happens in Postgres at all.
    if ((successes.total ?? 0) > successes.data.length) return;

    const { feeBreakdown } = await fetchBreakdown();
    const byFee = new Map<string, { qty: number; subtotal: number }>();
    for (const row of successes.data) {
      const tally = byFee.get(row.fee) ?? { qty: 0, subtotal: 0 };
      tally.qty += 1;
      tally.subtotal += row.transactionAmount;
      byFee.set(row.fee, tally);
    }

    for (const row of feeBreakdown) {
      const expected = byFee.get(row.fee) ?? { qty: 0, subtotal: 0 };
      expect(row.qty).toBe(expected.qty);
      expect(row.subtotal).toBeCloseTo(expected.subtotal, 2);
    }
  });

  it("holds the figures steady while the log is filtered by status", async () => {
    const unfiltered = await fetchBreakdown();
    const filtered = await fetchBreakdown({ status: "failed" });

    expect(filtered.feeBreakdown).toEqual(unfiltered.feeBreakdown);
  });

  it("narrows with the requested timeframe, unlike the period totals", async () => {
    // A well-formed one-second window predating the Portal: it must tally
    // nothing, while still zero-filling every configured fee.
    const emptyWindow = await fetchBreakdown({
      from: "2020-01-01T00:00:00Z",
      to: "2020-01-01T00:00:01Z",
    });

    expect(emptyWindow.feeBreakdown.length).toBeGreaterThanOrEqual(
      CONFIGURED_FEES.length,
    );
    for (const row of emptyWindow.feeBreakdown) {
      expect(row.qty).toBe(0);
      expect(row.subtotal).toBe(0);
    }
  });

  it("rejects a value that is neither true nor false", async () => {
    const response = await portalFetch(logUrl({ includeFeeBreakdown: "yes" }));

    expect(response.status).toBe(400);
  });
});
