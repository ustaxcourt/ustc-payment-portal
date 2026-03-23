import { z } from "zod";
import {
  TransactionsByStatusPathParamsSchema,
  TransactionsByStatusResponseSchema,
} from "../schemas/TransactionsByStatus.schema";

export type TransactionsByStatusPathParams = z.infer<
  typeof TransactionsByStatusPathParamsSchema
>;

export type TransactionsByStatusResponse = z.infer<
  typeof TransactionsByStatusResponseSchema
>;
