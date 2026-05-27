import { z } from "zod";

// Pay.gov tokens are 32 chars; ProcessPayment.schema.ts enforces the same on inbound
// requests. Catching here at /init beats a confusing /process error later.
export const StartOnlineCollectionResponseSchema = z.object({
  token: z.string().length(32),
});

export type StartOnlineCollectionResponse = z.infer<
  typeof StartOnlineCollectionResponseSchema
>;
