import knexFactory from "knex";
import { knexSnakeCaseMappers } from "objection";
import { PAYMENT_METHOD_LABELS } from "@utils/toApiPaymentMethod";
import { getFeeNamesByKey } from "../config/fees";
import { type OrderByClause, transactionLogOrderBy } from "./transactionLogSort";

/** Renders SQL without a database, configured like the real connection so the
 *  identifier mapping under test is the one production uses. */
const renderer = knexFactory({ client: "pg", ...knexSnakeCaseMappers() });

afterAll(async () => {
  await renderer.destroy();
});

const raw = (clause: OrderByClause) => {
  if (clause.kind !== "raw") {
    throw new Error("expected a raw clause");
  }
  return clause;
};

const renderOrderBy = (clause: OrderByClause): string =>
  renderer("transactions")
    .orderByRaw(raw(clause).sql, raw(clause).bindings)
    .toString();

describe("transactionLogOrderBy", () => {
  it("orders on the requested column, nulls last in both directions", () => {
    for (const order of ["asc", "desc"] as const) {
      const [primary] = transactionLogOrderBy("returnDetail", order);

      expect(raw(primary)).toEqual({
        kind: "raw",
        sql: `?? ${order} nulls last`,
        bindings: ["returnDetail"],
      });
    }
  });

  it("always breaks ties on the primary key", () => {
    const clauses = transactionLogOrderBy("transactionAmount", "desc");

    expect(clauses).toHaveLength(2);
    expect(clauses[1]).toEqual({
      kind: "column",
      column: "agencyTrackingId",
      order: "asc",
    });
  });

  it("resolves camelCase fields to their snake_case columns", () => {
    const [primary] = transactionLogOrderBy("clientName", "asc");

    expect(renderOrderBy(primary)).toContain(
      'order by "client_name" asc nulls last',
    );
  });

  describe("columns whose label is not what the database stores", () => {
    it("orders fee type by the name the response returns", () => {
      const [primary] = transactionLogOrderBy("feeName", "asc");
      const sql = renderOrderBy(primary);

      for (const [key, name] of Object.entries(getFeeNamesByKey())) {
        expect(sql).toContain(`when '${key}' then '${name}'`);
      }
      expect(sql).toContain('case "fee"');
      expect(sql).toContain("end asc nulls last");
    });

    it("orders payment method by its label", () => {
      const [primary] = transactionLogOrderBy("paymentMethod", "desc");
      const sql = renderOrderBy(primary);

      expect(sql).toContain('case "payment_method"');
      expect(sql).toContain("when 'plastic_card' then 'Credit/Debit Card'");
      expect(sql).toContain("end desc nulls last");
    });

    it("builds each label expression once and reuses it", () => {
      const [first] = transactionLogOrderBy("feeName", "asc");
      const [second] = transactionLogOrderBy("feeName", "desc");

      // Same bindings array, so the CASE was cached rather than rebuilt.
      expect(raw(first).bindings).toBe(raw(second).bindings);
    });

    // Guards the reason the CASE exists. If this ever passes, the mapping has
    // become order-preserving and the CASE will look like dead weight.
    it("is not equivalent to ordering on the stored value", () => {
      const byStoredValue = Object.keys(PAYMENT_METHOD_LABELS)
        .sort()
        .map((key) => PAYMENT_METHOD_LABELS[key as keyof typeof PAYMENT_METHOD_LABELS]);
      const byLabel = [...Object.values(PAYMENT_METHOD_LABELS)].sort();

      expect(byStoredValue).not.toEqual(byLabel);
    });
  });
});
