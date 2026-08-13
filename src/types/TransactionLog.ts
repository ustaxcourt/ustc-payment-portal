import { z } from "zod";
import { TransactionLogResponseSchema } from "@schemas/TransactionLog.schema";

export type { TransactionLogQuery } from "@schemas/TransactionLog.schema";

export type TransactionLogResponse = z.infer<
  typeof TransactionLogResponseSchema
>;
