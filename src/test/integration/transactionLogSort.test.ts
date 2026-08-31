import { isLocal } from "../../config/appEnv";
import { getFeeNamesByKey } from "../../config/fees";
import { PAYMENT_METHOD_LABELS } from "@utils/toApiPaymentMethod";
import {
  SORT_ORDERS,
  TRANSACTION_LOG_SORT_FIELDS,
} from "@schemas/TransactionLog.schema";
import type { TransactionLogResponse } from "@appTypes/TransactionLog";
import { signedFetch } from "./sigv4Helper";

/**
 * Ordering against a real database. `ORDER BY` on a column that no longer exists
 * fails when the statement is planned, so a renamed column surfaces here even
 * against an empty database.
 */

// Wide enough to pick up whatever the local database happens to hold.
const FROM = "2020-01-01T00:00:00Z";
const TO = "2030-01-01T00:00:00Z";
const PAGE_SIZE = 200;

describe("GET /transaction-log ordering", () => {
  jest.setTimeout(60_000);
  let baseUrl: string;

  beforeAll(() => {
    baseUrl = process.env.BASE_URL ?? "";
    if (!baseUrl) {
      throw new Error("BASE_URL is required for transaction log sort tests");
    }
  });

  const portalFetch = (url: string): Promise<Response> =>
    isLocal() ? fetch(url) : signedFetch(url, {});

  const logUrl = (params: Record<string, string> = {}): string => {
    const search = new URLSearchParams({
      from: FROM,
      to: TO,
      pageSize: String(PAGE_SIZE),
      ...params,
    });
    return `${baseUrl}/transaction-log?${search}`;
  };

  const fetchLog = async (
    params: Record<string, string> = {},
  ): Promise<TransactionLogResponse> => {
    const response = await portalFetch(logUrl(params));
    expect(response.status).toBe(200);
    return response.json();
  };

  /** Distinct values in the order they appear, nulls dropped. */
  const runsOf = <T>(rows: T[], pick: (row: T) => unknown): unknown[] => {
    const runs: unknown[] = [];
    for (const row of rows) {
      const value = pick(row);
      if (value === null || value === undefined) continue;
      if (runs.length === 0 || runs[runs.length - 1] !== value) runs.push(value);
    }
    return runs;
  };

  /** Asserts the observed values appear in the expected relative order,
   *  ignoring any the database does not currently hold. */
  const expectRelativeOrder = (observed: unknown[], expected: string[]) => {
    const ranked = observed.map((value) => expected.indexOf(String(value)));
    expect(ranked).not.toContain(-1);
    expect(ranked).toEqual([...ranked].sort((a, b) => a - b));
  };

  describe("every sortable column is a real column", () => {
    const cases = TRANSACTION_LOG_SORT_FIELDS.flatMap((sort) =>
      SORT_ORDERS.map((order) => ({ sort, order })),
    );

    it.each(cases)("orders by $sort $order", async ({ sort, order }) => {
      const body = await fetchLog({ sort, order });

      expect(body.sort).toBe(sort);
      expect(body.order).toBe(order);
    });
  });

  describe("ordering the user can see", () => {
    it("orders payment method by its label, not the stored value", async () => {
      // Stored order would be ach, paypal, plastic_card.
      const expected = Object.values(PAYMENT_METHOD_LABELS).sort();

      const asc = await fetchLog({ sort: "paymentMethod", order: "asc" });
      expectRelativeOrder(runsOf(asc.data, (r) => r.paymentMethod), expected);

      const desc = await fetchLog({ sort: "paymentMethod", order: "desc" });
      expectRelativeOrder(
        runsOf(desc.data, (r) => r.paymentMethod),
        [...expected].reverse(),
      );
    });

    it("orders fee type by the name the response returns", async () => {
      const expected = Object.values(getFeeNamesByKey()).sort();

      const asc = await fetchLog({ sort: "feeName", order: "asc" });
      expectRelativeOrder(runsOf(asc.data, (r) => r.feeName), expected);

      const desc = await fetchLog({ sort: "feeName", order: "desc" });
      expectRelativeOrder(
        runsOf(desc.data, (r) => r.feeName),
        [...expected].reverse(),
      );
    });

    it("orders amount numerically", async () => {
      const asc = await fetchLog({ sort: "transactionAmount", order: "asc" });
      const amounts = asc.data.map((row) => row.transactionAmount);

      expect(amounts).toEqual([...amounts].sort((a, b) => a - b));
    });

    it.each(["createdAt", "lastUpdatedAt"] as const)(
      "orders %s chronologically",
      async (column) => {
        const desc = await fetchLog({ sort: column, order: "desc" });
        const stamps = desc.data.map((row) =>
          new Date(row[column] as string).getTime(),
        );

        expect(stamps).toEqual([...stamps].sort((a, b) => b - a));
      },
    );
  });

  describe("rows with nothing in the sorted column", () => {
    it.each(SORT_ORDERS)("lists them last when ordering %s", async (order) => {
      const body = await fetchLog({ sort: "returnDetail", order });
      const values = body.data.map((row) => row.returnDetail ?? null);

      const lastValue = values.lastIndexOf(
        [...values].reverse().find((v) => v !== null) ?? null,
      );
      const firstNull = values.indexOf(null);

      if (firstNull !== -1 && lastValue !== -1) {
        expect(firstNull).toBeGreaterThan(lastValue);
      }
    });
  });

  describe("stability", () => {
    it("returns the same order for identical requests", async () => {
      // Pinned so a row another suite inserts mid-test (stamped `lastUpdatedAt`
      // "now", within the wide FROM/TO range above) can't land inside the page
      // window for one call and not the other.
      const to = new Date().toISOString();
      const ids = async () =>
        (await fetchLog({ sort: "feeName", order: "asc", to })).data.map(
          (row) => row.agencyTrackingId,
        );

      expect(await ids()).toEqual(await ids());
    });
  });

  describe("input the whitelist must refuse", () => {
    it.each([
      ["a column that is not sortable", { sort: "paygovToken" }],
      ["a direction that is not asc or desc", { order: "sideways" }],
      ["a column name carrying SQL", { sort: "createdAt; drop table x" }],
    ])("rejects %s", async (_label, params) => {
      const response = await portalFetch(
        logUrl(params as Record<string, string>),
      );

      expect(response.status).toBe(400);
    });
  });
});
