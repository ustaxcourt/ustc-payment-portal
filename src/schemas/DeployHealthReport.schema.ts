import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

const HealthCheckResultSchema = z
  .object({
    status: z.enum(["ok", "failed"]),
    latencyMs: z.number(),
    error: z.string().optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi("HealthCheckResult");

export const DeployHealthReportSchema = z
  .object({
    status: z.enum(["healthy", "unhealthy"]),
    environment: z.string(),
    timestamp: z.string(),
    releaseTag: z.string().optional(),
    checks: z.object({
      secrets: HealthCheckResultSchema,
      ssm: HealthCheckResultSchema,
      rds: HealthCheckResultSchema,
      payGov: HealthCheckResultSchema,
    }),
  })
  .openapi("DeployHealthReport");

export type DeployHealthReport = z.infer<typeof DeployHealthReportSchema>;
export type HealthCheckResult = z.infer<typeof HealthCheckResultSchema>;
