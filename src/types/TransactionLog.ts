import { z } from "zod";
import {
  TransactionLogQuerySchema,
  TransactionLogResponseSchema,
} from "@schemas/TransactionLog.schema";

export type TransactionLogQuery = z.infer<typeof TransactionLogQuerySchema>;

export type TransactionLogResponse = z.infer<
  typeof TransactionLogResponseSchema
>;
