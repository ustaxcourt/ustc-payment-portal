import { z } from "zod";
import {
  TransactionsByStatusResponseSchema,
} from "../schemas/TransactionsByStatus.schema";

export type TransactionsByStatusResponse = z.infer<
  typeof TransactionsByStatusResponseSchema
>;
