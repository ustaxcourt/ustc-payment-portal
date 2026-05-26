import { z } from "zod";

// Pay.gov tokens are exactly 32 characters. The symmetric constraint lives on the
// client-facing side in ProcessPayment.schema.ts (`token: z.string().length(32)`),
// so validating the same length here catches sandbox / vendor regressions at the
// /init boundary instead of letting them surface later at /process with a
// confusing client-side validation error.
export const StartOnlineCollectionResponseSchema = z.object({
  token: z.string().length(32),
});

export type StartOnlineCollectionResponse = z.infer<
  typeof StartOnlineCollectionResponseSchema
>;
