import TransactionModel from "./TransactionModel";

jest.mock("./knex", () => ({ getKnex: jest.fn() }));

const FROM = new Date("2026-08-03T04:00:00.000Z");
const TO = new Date("2026-08-04T04:00:00.000Z");

const METHODS = [
  "where",
  "andWhere",
  "orderBy",
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

const page = { from: FROM, to: TO, limit: 50, offset: 0 };

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
    expect(q.orderBy).toHaveBeenCalledWith("lastUpdatedAt", "desc");
    expect(q.limit).toHaveBeenCalledWith(25);
    expect(q.offset).toHaveBeenCalledWith(50);
    expect(result.total).toBe(90);
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
