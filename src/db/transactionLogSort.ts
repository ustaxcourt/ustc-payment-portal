import type {
  SortOrder,
  TransactionLogSortField,
} from "@schemas/TransactionLog.schema";
import { PAYMENT_METHOD_LABELS } from "@utils/toApiPaymentMethod";
import { getFeeNamesByKey } from "../config/fees";

// Identifiers are `??` bindings, which knexSnakeCaseMappers() resolves from the
// camelCase field names to the snake_case columns on disk.

/** Makes the ordering total, so it holds steady across identical requests. */
const TIEBREAK_COLUMN = "agencyTrackingId";

const DIRECTION_SQL: Record<SortOrder, string> = {
  asc: "asc",
  desc: "desc",
};

export type OrderByClause =
  | { kind: "column"; column: string; order: SortOrder }
  | { kind: "raw"; sql: string; bindings: string[] };

const labelCaseSql = (
  column: string,
  labels: Record<string, string>,
): { sql: string; bindings: string[] } | null => {
  const entries = Object.entries(labels);
  /* istanbul ignore next: both catalogues are non-empty compile-time constants, so this guards against a malformed CASE rather than a reachable state */
  if (entries.length === 0) {
    return null;
  }

  const whens = entries.map(() => "when ? then ?").join(" ");
  return {
    sql: `case ?? ${whens} end`,
    bindings: [column, ...entries.flat()],
  };
};

/** Computed on first use rather than at module load, which would make importing
 *  this module read the fee config as a side effect and break any test that
 *  mocks `config/fees` without stubbing every export. */
const once = <T>(compute: () => T): (() => T) => {
  let cached: T;
  let computed = false;

  return () => {
    if (!computed) {
      cached = compute();
      computed = true;
    }
    return cached;
  };
};

// Neither label is stored: `paypal` sorts before `plastic_card`, but the labels
// the user reads sort the other way round.
const feeNameCase = once(() => labelCaseSql("fee", getFeeNamesByKey()));
const paymentMethodCase = once(() =>
  labelCaseSql("paymentMethod", PAYMENT_METHOD_LABELS),
);

const derivedLabelSql = (field: TransactionLogSortField) => {
  switch (field) {
    case "feeName":
      return feeNameCase();
    case "paymentMethod":
      return paymentMethodCase();
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
