import type { z } from "zod";
import type { RecentTransactionsResponseSchema } from "@schemas/RecentTransactions.schema";

export type RecentTransactionsResponse = z.infer<
	typeof RecentTransactionsResponseSchema
>;
