import type {
  TransactionsByStatusPathParamsSchema,
  TransactionsByStatusResponseSchema,
} from "@schemas/TransactionsByStatus.schema";
import type { z } from "zod";

export type TransactionsByStatusPathParams = z.infer<
  typeof TransactionsByStatusPathParamsSchema
>;

export type TransactionsByStatusResponse = z.infer<
  typeof TransactionsByStatusResponseSchema
>;
