import { z } from "zod";
import {
  TransactionLogQuerySchema,
  TransactionLogResponseSchema,
  TransactionPriorYearTotalsSchema,
  TransactionTotalsSchema,
} from "@schemas/TransactionLog.schema";

export type TransactionLogQuery = z.infer<typeof TransactionLogQuerySchema>;

export type TransactionLogResponse = z.infer<
  typeof TransactionLogResponseSchema
>;

export type TransactionTotals = z.infer<typeof TransactionTotalsSchema>;

export type TransactionPriorYearTotals = z.infer<
  typeof TransactionPriorYearTotalsSchema
>;
