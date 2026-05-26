import { z } from "zod";

export const StartOnlineCollectionResponseSchema = z.object({
  token: z.string().min(1),
});

export type StartOnlineCollectionResponse = z.infer<
  typeof StartOnlineCollectionResponseSchema
>;
