import TransactionModel from "./TransactionModel";
import { getKnex } from "./knex";

jest.mock("./knex", () => ({ getKnex: jest.fn() }));

const NOW = new Date("2026-08-17T15:00:00.000Z");

const PERIODS = {
  day: { start: new Date("2026-08-17T04:00:00.000Z"), end: NOW },
  week: { start: new Date("2026-08-16T04:00:00.000Z"), end: NOW },
  month: { start: new Date("2026-08-01T04:00:00.000Z"), end: NOW },
  quarter: { start: new Date("2026-07-01T04:00:00.000Z"), end: NOW },
  fiscalYear: { start: new Date("2025-10-01T04:00:00.000Z"), end: NOW },
};

const METHODS = ["where", "andWhere", "select", "groupBy"];

const stubQuery = (rows: unknown[]) => {
  const chains: any[] = [];

  jest.spyOn(TransactionModel, "query").mockImplementation(((): any => {
    const chain: any = Promise.resolve(rows);
    for (const m of METHODS) chain[m] = jest.fn(() => chain);
    chains.push(chain);
    return chain;
  }) as any);

  return chains;
};

const stubRaw = () => {
  const raw = jest.fn((sql: string, bindings: unknown[]) => ({
    sql,
    bindings,
  }));
  (getKnex as jest.Mock).mockResolvedValue({ raw });
  return raw;
};

/** One grouped row as pg returns it: counts and decimals as strings, one
 *  qty/subtotal pair per period. */
const feeRow = (
  fee: string,
  tallies: Partial<Record<string, [string, string]>>,
) => {
  const row: Record<string, unknown> = { fee };
  for (const name of Object.keys(PERIODS)) {
    const [qty, subtotal] = tallies[name] ?? ["0", "0"];
    row[`${name}Qty`] = qty;
    row[`${name}Subtotal`] = subtotal;
  }
  return row;
};

afterEach(() => jest.restoreAllMocks());

describe("TransactionModel.feeTalliesByPeriods", () => {
  it("tallies successful payments only", async () => {
    stubRaw();
    const chains = stubQuery([]);

    await TransactionModel.feeTalliesByPeriods(PERIODS);
    const [q] = chains;

    expect(q.where).toHaveBeenCalledWith("paymentStatus", "success");
    expect(q.groupBy).toHaveBeenCalledWith("fee");
  });

  it("brackets the scan with the widest period", async () => {
    stubRaw();
    const chains = stubQuery([]);

    await TransactionModel.feeTalliesByPeriods(PERIODS);
    const [q] = chains;

    expect(q.andWhere).toHaveBeenCalledWith(
      "lastUpdatedAt",
      ">=",
      PERIODS.fiscalYear.start,
    );
    expect(q.andWhere).toHaveBeenCalledWith("lastUpdatedAt", "<", NOW);
  });

  it("builds one filtered count and sum per period", async () => {
    const raw = stubRaw();
    stubQuery([]);

    await TransactionModel.feeTalliesByPeriods(PERIODS);

    expect(raw).toHaveBeenCalledWith(
      "count(*) filter (where ?? >= ? and ?? < ?) as ??",
      ["lastUpdatedAt", PERIODS.day.start, "lastUpdatedAt", NOW, "dayQty"],
    );
    expect(raw).toHaveBeenCalledWith(
      "coalesce(sum(??) filter (where ?? >= ? and ?? < ?), 0) as ??",
      [
        "transactionAmount",
        "lastUpdatedAt",
        PERIODS.fiscalYear.start,
        "lastUpdatedAt",
        NOW,
        "fiscalYearSubtotal",
      ],
    );
    // 5 periods × (count + sum).
    expect(raw).toHaveBeenCalledTimes(10);
  });

  it("shapes the grouped rows into per-period tallies, dropping empty ones", async () => {
    stubRaw();
    stubQuery([
      feeRow("PETITION_FILING_FEE", {
        day: ["1", "60"],
        week: ["3", "180"],
        fiscalYear: ["25", "1500"],
      }),
      feeRow("NON_ATTORNEY_EXAM_FEE", {
        fiscalYear: ["4", "1000"],
      }),
    ]);

    const tallies = await TransactionModel.feeTalliesByPeriods(PERIODS);

    expect(tallies.day).toEqual([
      { fee: "PETITION_FILING_FEE", qty: 1, subtotal: 60 },
    ]);
    expect(tallies.week).toEqual([
      { fee: "PETITION_FILING_FEE", qty: 3, subtotal: 180 },
    ]);
    expect(tallies.month).toEqual([]);
    expect(tallies.fiscalYear).toEqual([
      { fee: "PETITION_FILING_FEE", qty: 25, subtotal: 1500 },
      { fee: "NON_ATTORNEY_EXAM_FEE", qty: 4, subtotal: 1000 },
    ]);
  });

  it("fails loudly on an unusable tally rather than reporting $0", async () => {
    stubRaw();
    const row = feeRow("PETITION_FILING_FEE", { day: ["1", "60"] });
    row.daySubtotal = "not-a-number";
    stubQuery([row]);

    await expect(TransactionModel.feeTalliesByPeriods(PERIODS)).rejects.toThrow(
      'no usable tally for the "PETITION_FILING_FEE" fee in the "day" period',
    );
  });
});
