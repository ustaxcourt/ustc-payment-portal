import type { RecentTransactionsResponseSchema } from "@schemas/RecentTransactions.schema";
import type { z } from "zod";

export type RecentTransactionsResponse = z.infer<
	typeof RecentTransactionsResponseSchema
>;
