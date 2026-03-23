import { z } from "zod";
import { RecentTransactionsResponseSchema } from "../schemas/RecentTransactions.schema";

export type RecentTransactionsResponse = z.infer<
  typeof RecentTransactionsResponseSchema
>;
