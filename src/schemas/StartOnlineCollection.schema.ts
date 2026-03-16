import { z } from "zod";

export const StartOnlineCollectionSchema = z.object({
  tcsAppId: z.string(),
  agencyTrackingId: z.string(),
  transactionAmount: z.number(),
  urlCancel: z.string(),
  urlSuccess: z.string(),
});

export type StartOnlineCollection = z.infer<typeof StartOnlineCollectionSchema>;
