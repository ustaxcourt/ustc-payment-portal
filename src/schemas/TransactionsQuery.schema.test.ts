import { TransactionsQuerySchema } from "./TransactionsQuery.schema";

const parse = (query: Record<string, string>) =>
  TransactionsQuerySchema.safeParse(query);

describe("TransactionsQuerySchema", () => {
  it("defaults pagination when only a status filter is supplied", () => {
    const result = parse({ status: "pending" });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      status: "pending",
      page: 1,
      pageSize: 50,
    });
    expect(result.data).not.toHaveProperty("from");
    expect(result.data).not.toHaveProperty("to");
  });

  it("converts inclusive MM/DD/YYYY dates into Court-day bounds", () => {
    const result = parse({ from: "08/10/2026", to: "08/10/2026" });

    if (!result.success || !("from" in result.data) || !("to" in result.data)) {
      throw new Error("Expected query to parse successfully");
    }
    const datedQuery = result.data as { from: Date; to: Date };
    expect(datedQuery.from.toISOString()).toBe("2026-08-10T04:00:00.000Z");
    expect(datedQuery.to.toISOString()).toBe("2026-08-11T04:00:00.000Z");
  });

  it.each([
    [{ from: "08/10/2026" }, "`from` and `to` must be supplied together"],
    [
      { from: "2026-08-10", to: "08/10/2026" },
      "Date must be a valid MM/DD/YYYY value",
    ],
    [
      { from: "02/30/2026", to: "03/01/2026" },
      "Date must be a valid MM/DD/YYYY value",
    ],
    [
      { from: "08/11/2026", to: "08/10/2026" },
      "`from` must be on or before `to`",
    ],
  ])("rejects invalid query %j", (query, message) => {
    const result = parse(query as Record<string, string>);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(message);
  });
});
