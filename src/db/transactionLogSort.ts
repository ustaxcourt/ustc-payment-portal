import type {
  SortOrder,
  TransactionLogSortField,
} from "@schemas/TransactionLog.schema";
import { PAYMENT_METHOD_LABELS } from "@utils/toApiPaymentMethod";
import { getFeeNamesByKey } from "../config/fees";

/**
 * Ordering for the transaction log, kept out of the model so it can be asserted
 * on its own: these clauses are the only place a column name reaches SQL.
 *
 * Identifiers are passed as `??` bindings rather than interpolated. Knex is
 * configured with `knexSnakeCaseMappers()` at the connection level, so `??`
 * bindings run through `wrapIdentifier` and the camelCase field names used
 * throughout the codebase resolve to the snake_case columns on disk.
 */

/** Applied after the requested column so the ordering is total. Without it rows
 *  that tie — every row, when a whole day shares one fee — come back in
 *  whatever order the planner happened to produce, which reshuffles between
 *  identical requests and would drop or repeat rows once paging is added. */
const TIEBREAK_COLUMN = "agencyTrackingId";

/** Direction is never passed through as caller text, even though Zod has
 *  already narrowed it to two values. */
const DIRECTION_SQL: Record<SortOrder, string> = {
  asc: "asc",
  desc: "desc",
};

export type OrderByClause =
  | { kind: "column"; column: string; order: SortOrder }
  | { kind: "raw"; sql: string; bindings: string[] };

/**
 * `CASE <column> WHEN <stored> THEN <label> ... END`, so the database orders by
 * the label the response carries instead of the value in the column. Built from
 * the same constants that produce the response, so a renamed label or a new fee
 * cannot leave the ordering behind.
 */
const labelCaseSql = (
  column: string,
  labels: Record<string, string>,
): { sql: string; bindings: string[] } | null => {
  const entries = Object.entries(labels);
  if (entries.length === 0) {
    return null;
  }

  const whens = entries.map(() => "when ? then ?").join(" ");
  return {
    sql: `case ?? ${whens} end`,
    bindings: [column, ...entries.flat()],
  };
};

/** The two fields the database cannot order on directly: neither label is
 *  stored. `paypal` sorts before `plastic_card`, but the labels the user reads
 *  sort the other way round — "Credit/Debit Card" before "PayPal". */
const derivedLabelSql = (field: TransactionLogSortField) => {
  switch (field) {
    case "feeName":
      return labelCaseSql("fee", getFeeNamesByKey());
    case "paymentMethod":
      return labelCaseSql("paymentMethod", PAYMENT_METHOD_LABELS);
    default:
      return null;
  }
};

export const transactionLogOrderBy = (
  sort: TransactionLogSortField,
  order: SortOrder,
): OrderByClause[] => {
  const direction = DIRECTION_SQL[order];
  const derived = derivedLabelSql(sort);

  // Rows with nothing in the sorted column — a pending payment has no method,
  // a successful one no failure reason — render as "—". They sink to the bottom
  // in both directions so what the user is scanning for is never behind a block
  // of blanks.
  const primary: OrderByClause = derived
    ? {
        kind: "raw",
        sql: `${derived.sql} ${direction} nulls last`,
        bindings: derived.bindings,
      }
    : {
        kind: "raw",
        sql: `?? ${direction} nulls last`,
        bindings: [sort],
      };

  return [primary, { kind: "column", column: TIEBREAK_COLUMN, order: "asc" }];
};
